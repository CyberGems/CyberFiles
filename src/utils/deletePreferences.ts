/* How the delete action behaves once the user asks not to be asked again.
   `ask` is the master switch: it is the only value the Settings card writes, and turning it
   back on restores the dialog without touching the remembered mode. */
export interface DeleteConfirmationPreference {
  ask: boolean;
  /* The choice that was ticked in the dialog when "do not ask again" was checked. */
  permanently: boolean;
}

export const DELETE_CONFIRMATION_STORAGE_KEY = 'cyberfiles_delete_confirmation_v1';

export const DEFAULT_DELETE_CONFIRMATION: DeleteConfirmationPreference = {
  ask: true,
  permanently: false,
};

export function readDeleteConfirmation(): DeleteConfirmationPreference {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DELETE_CONFIRMATION_STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_DELETE_CONFIRMATION;
    return {
      ask: typeof saved.ask === 'boolean' ? saved.ask : DEFAULT_DELETE_CONFIRMATION.ask,
      permanently: typeof saved.permanently === 'boolean' ? saved.permanently : DEFAULT_DELETE_CONFIRMATION.permanently,
    };
  } catch {
    return DEFAULT_DELETE_CONFIRMATION;
  }
}

export function writeDeleteConfirmation(preference: DeleteConfirmationPreference) {
  try {
    window.localStorage.setItem(DELETE_CONFIRMATION_STORAGE_KEY, JSON.stringify(preference));
  } catch {
    // The preference stays in component state for this session if storage is unavailable.
  }
}
