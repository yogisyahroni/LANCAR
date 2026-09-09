export const EXPERIENCE_CAPABILITIES = {
  read: 'experience.read',
  draftWrite: 'experience.draft.write',
  assetWrite: 'experience.asset.write',
  targetingWrite: 'experience.targeting.write',
  featureFlagWrite: 'experience.feature_flag.write',
  killSwitchExecute: 'experience.kill_switch.execute',
  submitApproval: 'experience.submit_approval',
  approve: 'experience.approve',
  publish: 'experience.publish',
  rollback: 'experience.rollback',
  globalPublish: 'experience.global.publish',
  versionPolicyWrite: 'experience.version_policy.write',
} as const

export type ExperienceCapability = (typeof EXPERIENCE_CAPABILITIES)[keyof typeof EXPERIENCE_CAPABILITIES]

type PermissionedUser = { permissions?: readonly string[] | null } | null | undefined

export const hasExperiencePermission = (
  user: PermissionedUser,
  capability: ExperienceCapability,
) => Boolean(user?.permissions?.includes(capability))
