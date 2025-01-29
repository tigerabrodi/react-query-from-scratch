export const DEFAULT_STALE_TIME = 0
export const FORCE_STALE_TIME = -1

export const ONE_SECOND_IN_MS = 1000
export const ONE_MINUTE_IN_MS = 60 * ONE_SECOND_IN_MS
export const DEFAULT_GC_TIME = 5 * ONE_MINUTE_IN_MS

// We don't want to do any background fetches right away if the query is initialized with initial data
// This is a bit of a work around
// The issue is that when we set state to success
// we notify subscribers immediately
// This causes a background fetch to be triggered
// Which causes an infinite loop here of background fetches
// So we wait 250ms before doing any background fetches
export const FIRST_FETCH_SUCCESS_BACKGROUND_FETCH_BUFFER_WINDOW_MS = 250
