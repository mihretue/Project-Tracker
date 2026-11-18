/**
 * Application-wide role stored on the User record.
 * Independent from MembershipRole, which is scoped to a single organization.
 */
export enum PlatformRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  USER = 'USER',
}
