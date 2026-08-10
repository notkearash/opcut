use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};

const IDLE: u8 = 0;
const CYCLING: u8 = 1;
const SEARCH: u8 = 2;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ReleaseAction {
    Commit,
    Ignore,
}

pub(crate) struct Machine {
    state: AtomicU8,
    generation: AtomicU64,
}

impl Machine {
    pub(crate) const fn new() -> Self {
        Self {
            state: AtomicU8::new(IDLE),
            generation: AtomicU64::new(0),
        }
    }

    pub(crate) fn on_tab(&self) -> Option<u64> {
        if self
            .state
            .compare_exchange(IDLE, CYCLING, Ordering::SeqCst, Ordering::SeqCst)
            .is_ok()
        {
            Some(self.generation.fetch_add(1, Ordering::SeqCst) + 1)
        } else {
            None
        }
    }

    pub(crate) fn enter_search(&self) {
        let _ = self
            .state
            .compare_exchange(CYCLING, SEARCH, Ordering::SeqCst, Ordering::SeqCst);
    }

    pub(crate) fn cancel(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.state.store(IDLE, Ordering::SeqCst);
    }

    pub(crate) fn is_stale(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) != generation
    }

    pub(crate) fn on_option_released(&self, generation: u64) -> ReleaseAction {
        if self.is_stale(generation) {
            return ReleaseAction::Ignore;
        }
        let previous = self.state.swap(IDLE, Ordering::SeqCst);
        let cancelled_during_swap = self.is_stale(generation);
        if cancelled_during_swap || previous != CYCLING {
            return ReleaseAction::Ignore;
        }
        ReleaseAction::Commit
    }
}

static MACHINE: Machine = Machine::new();

pub fn enter_search() {
    MACHINE.enter_search();
}

pub fn cancel() {
    MACHINE.cancel();
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{ReleaseAction, MACHINE};
    use std::time::Duration;
    use tauri::{AppHandle, Emitter};

    const CG_EVENT_FLAG_MASK_ALTERNATE: u64 = 0x0008_0000;
    const CG_EVENT_SOURCE_STATE_COMBINED_SESSION: i32 = 0;
    const OPTION_POLL_INTERVAL: Duration = Duration::from_millis(15);

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceFlagsState(state_id: i32) -> u64;
    }

    fn option_held() -> bool {
        unsafe {
            CGEventSourceFlagsState(CG_EVENT_SOURCE_STATE_COMBINED_SESSION)
                & CG_EVENT_FLAG_MASK_ALTERNATE
                != 0
        }
    }

    pub fn handle_tab(app: &AppHandle, backward: bool) {
        match MACHINE.on_tab() {
            Some(generation) => {
                crate::show_switcher(app);
                spawn_option_release_watcher(app.clone(), generation);
            }
            None => {
                let _ = app.emit("switcher-cycle", backward);
            }
        }
    }

    fn spawn_option_release_watcher(app: AppHandle, generation: u64) {
        std::thread::spawn(move || loop {
            std::thread::sleep(OPTION_POLL_INTERVAL);
            if MACHINE.is_stale(generation) {
                return;
            }
            if option_held() {
                continue;
            }
            let action = MACHINE.on_option_released(generation);
            if action == ReleaseAction::Commit {
                let _ = app.emit("switcher-commit", ());
            }
            return;
        });
    }
}

#[cfg(target_os = "macos")]
pub use macos::handle_tab;

#[cfg(test)]
mod tests {
    use super::{Machine, ReleaseAction};

    #[test]
    fn tap_opens_then_commit_on_release() {
        let m = Machine::new();
        let generation = m.on_tab().expect("first tab starts a session");
        assert_eq!(m.on_tab(), None, "second tab cycles instead of reopening");
        assert_eq!(m.on_option_released(generation), ReleaseAction::Commit);
        assert_eq!(
            m.on_option_released(generation),
            ReleaseAction::Ignore,
            "a stray watcher tick after the release does nothing"
        );
    }

    #[test]
    fn slash_disarms_release() {
        let m = Machine::new();
        let generation = m.on_tab().expect("session starts");
        m.enter_search();
        assert_eq!(m.on_option_released(generation), ReleaseAction::Ignore);
        assert!(m.on_tab().is_some(), "a new tab starts a fresh session");
    }

    #[test]
    fn cancel_invalidates_watcher() {
        let m = Machine::new();
        let generation = m.on_tab().expect("session starts");
        m.cancel();
        assert!(m.is_stale(generation));
        assert_eq!(m.on_option_released(generation), ReleaseAction::Ignore);
        let next = m.on_tab().expect("new session after cancel");
        assert_ne!(next, generation);
    }

    #[test]
    fn enter_search_requires_active_session() {
        let m = Machine::new();
        m.enter_search();
        assert!(
            m.on_tab().is_some(),
            "stray search command leaves idle intact"
        );
    }
}
