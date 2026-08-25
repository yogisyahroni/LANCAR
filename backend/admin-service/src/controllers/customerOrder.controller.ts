// Facade preserving the original public API (controllers.customerOrder.*) after the
// P0 god-file split into focused controllers under ./order.
// Every previously-exported function is now defined (verbatim) in ./order/*.
export * from './order';
