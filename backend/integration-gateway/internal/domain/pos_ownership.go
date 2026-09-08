package domain

import "fmt"

const (
	POSCanonicalOwner = "lancar"
	POSExternalOwner  = "pos"
)

// ValidatePOSMutationSource makes ownership conflicts explicit. LANCAR owns
// catalog identity, price, availability and stock. POS connectors receive
// projections; they cannot silently write those canonical facts back.
func ValidatePOSMutationSource(source string) error {
	if source != POSCanonicalOwner {
		return fmt.Errorf("canonical catalog and inventory are owned by lancar; source %q is read-only", source)
	}
	return nil
}
