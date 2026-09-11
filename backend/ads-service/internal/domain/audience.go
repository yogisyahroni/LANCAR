package domain

type Audience struct {
	MarketCodes      []string `json:"market_codes,omitempty"`
	ZoneCodes        []string `json:"zone_codes,omitempty"`
	ServiceAreaCodes []string `json:"service_area_codes,omitempty"`
	Relationship     string   `json:"relationship,omitempty"`
	IntentCategories []string `json:"intent_categories,omitempty"`
	AppVersions      []string `json:"app_versions,omitempty"`
	PrivacyCohort    string   `json:"privacy_cohort,omitempty"`
}

type AudienceContext struct {
	MarketCode      string
	ZoneCode        string
	ServiceAreaCode string
	Relationship    string
	IntentCategory  string
	AppVersion      string
	PrivacyCohort   string
}

func (a Audience) Matches(ctx AudienceContext) bool {
	return matchOrEmpty(a.MarketCodes, ctx.MarketCode) &&
		matchOrEmpty(a.ZoneCodes, ctx.ZoneCode) &&
		matchOrEmpty(a.ServiceAreaCodes, ctx.ServiceAreaCode) &&
		matchOrEmpty(a.IntentCategories, ctx.IntentCategory) &&
		matchOrEmpty(a.AppVersions, ctx.AppVersion) &&
		matchOrEmpty([]string{a.Relationship}, ctx.Relationship) &&
		matchOrEmpty([]string{a.PrivacyCohort}, ctx.PrivacyCohort)
}

func matchOrEmpty(allowed []string, value string) bool {
	if len(allowed) == 0 || (len(allowed) == 1 && allowed[0] == "") {
		return true
	}
	for _, candidate := range allowed {
		if candidate == value {
			return true
		}
	}
	return false
}
