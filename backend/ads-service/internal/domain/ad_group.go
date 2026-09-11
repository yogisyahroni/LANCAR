package domain

type AdGroup struct {
	ID          string   `json:"id"`
	CampaignID  string   `json:"campaign_id"`
	Name        string   `json:"name"`
	CreativeIDs []string `json:"creative_ids"`
}
