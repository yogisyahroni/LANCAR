// Facade preserving the original public API (controllers.courierAuth.*) after the
// P0 god-file split into focused controllers under ./courier.
// Every previously-exported function is now defined (verbatim) in ./courier/*.
export * from './courier';
