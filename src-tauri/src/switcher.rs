//! ⌥Tab app-switcher session tracking.
//!
//! The global-shortcut plugin reports ⌥Tab presses but can never report the Option key
//! being released on its own, so a session is driven by two cooperating parts:
//! a lock-free state machine (below) shared between the hotkey handler, the webview
//! commands and a watcher thread; and, on macOS, that watcher thread polling
//! `CGEventSourceFlagsState` — a public permission-free query of the current modifier
//! state — until Option goes up. No Accessibility or Input Monitoring permission is
//! involved anywhere.

use std::sync::atomic::{AtomicU64, AtomicU8, Ordering};

const IDLE: u8 = 0;
const CYCLING: u8 = 1;
const SEARCH: u8 = 2;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ReleaseAction {
    /// Option went up while cycling → focus the highlighted app.
    Commit,
    /// Session was cancelled, superseded, or in search mode → do nothing.
    Ignore,
}

/// Session state machine. The generation counter invalidates a watcher thread whose
/// session has been cancelled or superseded, so a stale thread can never commit.
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

    /// ⌥Tab pressed. Returns `Some(generation)` when this press begins a new session
    /// (the caller shows the switcher and spawns a watcher for that generation);
    /// `None` when a session is already active (the caller cycles the selection).
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

    /// `/` pressed while cycling: releasing Option must no longer switch apps.
    pub(crate) fn enter_search(&self) {
        let _ = self
            .state
            .compare_exchange(CYCLING, SEARCH, Ordering::SeqCst, Ordering::SeqCst);
    }

    /// End the session without committing (panel hidden, Escape, Enter, focus loss).
    pub(crate) fn cancel(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.state.store(IDLE, Ordering::SeqCst);
    }

    /// Whether the watcher for `generation` has been invalidated.
    pub(crate) fn is_stale(&self, generation: u64) -> bool {
        self.generation.load(Ordering::SeqCst) != generation
    }

    /// Option released, observed by the watcher for `generation`.
    pub(crate) fn on_option_released(&self, generation: u64) -> ReleaseAction {
        if self.is_stale(generation) {
            return ReleaseAction::Ignore;
        }
        let previous = self.state.swap(IDLE, Ordering::SeqCst);
        // Re-check: a cancel may have raced between the load and the swap.
        if self.is_stale(generation) || previous != CYCLING {
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

    // kCGEventFlagMaskAlternate — the Option key bit in a CGEventFlags word.
    const OPTION_MASK: u64 = 0x0008_0000;
    // kCGEventSourceStateCombinedSessionState.
    const COMBINED_SESSION_STATE: i32 = 0;

    #[link(name = "CoreGraphics", kind = "framework")]
    unsafe extern "C" {
        fn CGEventSourceFlagsState(state_id: i32) -> u64;
    }

    fn option_held() -> bool {
        unsafe { CGEventSourceFlagsState(COMBINED_SESSION_STATE) & OPTION_MASK != 0 }
    }

    /// ⌥Tab (or ⇧⌥Tab) hotkey fired. First press of a hold opens the switcher and
    /// starts watching for Option release; further presses cycle the selection.
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

    /// Poll the session modifier state until Option goes up, then commit (or not,
    /// per the state machine). Sessions last at most a few seconds, so a short-lived
    /// 15 ms poll is cheap; the thread exits as soon as its generation goes stale.
    fn spawn_option_release_watcher(app: AppHandle, generation: u64) {
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(15));
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
        // Release already ended the session; a stray watcher tick does nothing.
        assert_eq!(m.on_option_released(generation), ReleaseAction::Ignore);
    }

    #[test]
    fn slash_disarms_release() {
        let m = Machine::new();
        let generation = m.on_tab().expect("session starts");
        m.enter_search();
        assert_eq!(m.on_option_released(generation), ReleaseAction::Ignore);
        // Search ended the session state; a new tab starts a fresh session.
        assert!(m.on_tab().is_some());
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
