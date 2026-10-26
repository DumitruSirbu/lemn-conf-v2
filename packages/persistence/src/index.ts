export { generateDesignId } from "./generate-design-id.js";
export { createNeonDesignRowSource } from "./design-row-source.js";
export type {
  DesignBackupRow,
  DesignRowPageQuery,
  DesignRowSource,
} from "./design-row-source.js";
export { createNeonPresetRowSource } from "./preset-row-source.js";
export type {
  PresetBackupRow,
  PresetRowPageQuery,
  PresetRowSource,
} from "./preset-row-source.js";
export { FakeConfigurationRepository } from "./fake-configuration-repository.js";
export { FakeDesignClaimRepository } from "./fake-design-claim-repository.js";
export type { HeldClaimableDesign } from "./fake-design-claim-repository.js";
export {
  DesignWriteConflictError,
  DesignWriteForbiddenError,
  NeonConfigurationRepository,
} from "./neon-configuration-repository.js";
export type {
  AuthorizedConfigurationRepository,
  AuthorizedDesignLookup,
  AuthorizedDesignRepository,
  AuthorizedSave,
  DesignAccessor,
  DesignClaimRepository,
  DesignVersion,
  LoadOwnedOutcome,
  MintDesign,
  MintVisitor,
  OwnedDesignLookup,
  OwnedDesignRepository,
  RequestVisitor,
  SaveCredential,
  SaveOutcome,
  StoredDesign,
  VisitorDesignsClaim,
  VisitorResumeLookup,
  VisitorResumeRepository,
} from "./neon-configuration-repository.js";
export { isDesignRevision } from "./design-revision.js";
export type { DesignRevision } from "./design-revision.js";
export { NeonShareLinkRepository } from "./share-link-repository.js";
export type {
  IssueShareLink,
  LoadSharedOutcome,
  ShareCredential,
  ShareLinkCredentials,
  ShareLinkIssueOutcome,
  ShareLinkRepository,
  ShareLinkRevokeOutcome,
  ShareLinkStatus,
  ShareLinkStatusOutcome,
} from "./share-link-repository.js";
export {
  NeonSentKitchenViewRepository,
  SentKitchenViewRepositoryError,
} from "./sent-kitchen-view-repository.js";
export type {
  SentKitchenViewLookup,
  SentKitchenViewOperation,
  SentKitchenViewRecording,
  SentKitchenViewRepository,
  SentKitchenViewToRecord,
} from "./sent-kitchen-view-repository.js";
export { FakeSentKitchenViewRepository } from "./fake-sent-kitchen-view-repository.js";
export type {
  FakeSentKitchenViewRepositoryOptions,
  HeldSentKitchenView,
} from "./fake-sent-kitchen-view-repository.js";
export { PresetRepositoryError } from "./preset-repository.js";
export {
  MAX_PRESET_DESIGN_BYTES,
  MAX_PRESET_NAME_CHARACTERS,
  MAX_PRESET_THUMBNAIL_BYTES,
  isShowablePresetName,
} from "@lemnaria/configurator-domain";
export { isWithinPresetDesignBound } from "./preset-validation.js";
export type {
  PresetImageLookup,
  PresetListing,
  PresetLookup,
  PresetNeighbourhood,
  PresetOperation,
  PresetRepository,
  PresetShape,
  PresetStatus,
  PresetThumbnailType,
  PresetToRecord,
  PresetWalls,
  StoredPreset,
} from "./preset-repository.js";
export { NeonPresetRepository } from "./neon-preset-repository.js";
export { FakePresetRepository } from "./fake-preset-repository.js";
export type { HeldPreset } from "./fake-preset-repository.js";
export { NeonRateLimitStore } from "./neon-rate-limit-store.js";
export {
  RateLimitStoreError,
  RateLimitWindowConflictError,
} from "./rate-limit-store.js";
export type {
  RateLimitBucket,
  RateLimitOperation,
  RateLimitStore,
  RateLimitWindow,
  WindowTotals,
} from "./rate-limit-store.js";
export { FakeRateLimitStore } from "./fake-rate-limit-store.js";
export {
  CSP_REPORT_CAPACITY,
  CspReportStoreError,
  requireValidCspReportRow,
} from "./csp-report-store.js";
export type {
  CspReportOperation,
  CspReportPlacement,
  CspReportRow,
  CspReportStore,
} from "./csp-report-store.js";
export { NeonCspReportStore } from "./neon-csp-report-store.js";
export { FakeCspReportStore } from "./fake-csp-report-store.js";
export type { HeldCspReport } from "./fake-csp-report-store.js";
export {
  ContactSubmissionStoreError,
  isSubmissionReference,
} from "./contact-submission-store.js";
export type {
  ContactSubmissionOperation,
  ContactSubmissionStore,
  ContactSubmissionToRecord,
  NoSentReference,
  RecordedSubmission,
  SentReference,
  SentReferenceLookup,
  SentReferenceReader,
  SentReferenceRequest,
  StoredSubmission,
  SubmissionAbsent,
  SubmissionConflict,
  SubmissionLookup,
  SubmissionLookupRequest,
  SubmissionRecording,
} from "./contact-submission-store.js";
export { FakeContactSubmissionStore } from "./fake-contact-submission-store.js";
export { NeonContactSubmissionStore } from "./neon-contact-submission-store.js";
export type { NeonContactSubmissionStoreOptions } from "./neon-contact-submission-store.js";
export type {
  FakeContactSubmissionStoreOptions,
  HeldContactSubmission,
} from "./fake-contact-submission-store.js";
export { AccountStoreError, EMAIL_TOKEN_PURPOSES } from "./account-store.js";
export type {
  AccountCreation,
  AccountLookup,
  AccountStore,
  AccountStoreOperation,
  AddressReservationQuestion,
  EmailChangeConfirmation,
  EmailChangeOutcome,
  EmailChangeRevert,
  EmailChangeRevertOutcome,
  EmailChangeTokenToIssue,
  EmailConfirmation,
  EmailConfirmationOutcome,
  EmailTokenPurpose,
  LiveTokenLookup,
  NewAccount,
  PasswordChange,
  PasswordChangeOutcome,
  PasswordRehash,
  PasswordRehashOutcome,
  PasswordReset,
  PasswordResetOutcome,
  PlainEmailTokenPurpose,
  PreviousAddress,
  ProfileLookup,
  ProfileUpdate,
  ProfileUpdateOutcome,
  RegistrationReplacement,
  RegistrationReplacementOutcome,
  RevertAddressLookup,
  StoredAccount,
  StoredProfile,
  TokenIssueOutcome,
  TokenToIssue,
} from "./account-store.js";
export { generateAccountId } from "./generate-account-id.js";
export { NeonAccountStore } from "./neon-account-store.js";
export { FakeAccountStore } from "./fake-account-store.js";
export type {
  FakeAccountStoreOptions,
  HeldEmailToken,
} from "./fake-account-store.js";
export {
  SESSION_TOUCH_INTERVAL_SECONDS,
  SessionStoreError,
} from "./session-store.js";
export type {
  IdleLifetimeSecondsByRole,
  NewSession,
  SessionAccount,
  SessionCreation,
  SessionLookup,
  SessionLookupRequest,
  SessionStore,
  SessionStoreOperation,
} from "./session-store.js";
export { NeonSessionStore } from "./neon-session-store.js";
export {
  FakeSessionStore,
  createFakeAccountAndSessionStores,
} from "./fake-session-store.js";
export type {
  FakeSessionStoreOptions,
  HeldSession,
} from "./fake-session-store.js";
export {
  AccountKitchenStoreError,
  MAX_EXPORTED_KITCHENS,
  MAX_EXPORTED_NOTE_BYTES,
  MAX_EXPORTED_NOTES_IN_TOTAL,
  MAX_EXPORTED_NOTES_PER_KITCHEN,
  MAX_KITCHEN_NAME_CHARACTERS,
  MAX_KITCHEN_PAGE_SIZE,
  isKitchenCursor,
} from "./account-kitchen-store.js";
export type {
  AccountKitchenStore,
  AccountKitchenStoreOperation,
  ExportedKitchen,
  ExportedKitchenNotes,
  ExportedNote,
  ExportSize,
  KitchenCursor,
  KitchenDeleteOutcome,
  KitchenDuplication,
  KitchenDuplicationOutcome,
  KitchenExport,
  KitchenHideOutcome,
  KitchenMark,
  KitchenPage,
  KitchenPageRequest,
  KitchenRename,
  KitchenRenameOutcome,
  ListedKitchen,
  SentMarkStore,
} from "./account-kitchen-store.js";
export {
  NeonAccountKitchenStore,
  NeonSentMarkStore,
} from "./neon-account-kitchen-store.js";
export {
  FakeAccountKitchenStore,
  FakeSentMarkStore,
} from "./fake-account-kitchen-store.js";
export type {
  FakeAccountKitchenStoreOptions,
  HeldKitchen,
  SeededKitchen,
  SeededNote,
} from "./fake-account-kitchen-store.js";
export {
  MAX_STAFF_AUDIT_IDLE_LIFETIME_SECONDS,
  MAX_STAFF_AUDIT_PAGE,
  STAFF_AUDIT_PAGE_SIZE,
  StaffAuditStoreError,
} from "./staff-audit-store.js";
export type {
  StaffAuditAccountRef,
  StaffAuditDesignRef,
  StaffAuditPage,
  StaffAuditPageRequest,
  StaffAuditPageRow,
  StaffAuditReading,
  StaffAuditRecord,
  StaffAuditRecordRefusal,
  StaffAuditStore,
  StaffAuditStoreFailure,
  StaffAuditStoreOperation,
} from "./staff-audit-store.js";
export { NeonStaffAuditStore } from "./neon-staff-audit-store.js";
export { FakeStaffAuditStore } from "./fake-staff-audit-store.js";
export type {
  FakeStaffAuditStoreOptions,
  HeldStaffAuditEvent,
  PlantedStaffAuditEvent,
  StagedStaffAuditEvent,
  StaffAuditDirectory,
  StaffAuditDirectoryAccount,
  StaffAuditDirectoryDesign,
} from "./fake-staff-audit-store.js";
export {
  NOTES_READ_LIMIT,
  ROMANIAN_CEDILLA_LETTERS,
  ROMANIAN_COMMA_BELOW_LETTERS,
  StaffKitchenReaderError,
  foldRomanianSearchText,
  isWellFormedDesignId,
  likePatternContaining,
  requireValidStaffKitchenQuery,
  shownStaffStatusOf,
} from "./staff-kitchen-reader.js";
export type {
  ShownStaffStatus,
  StaffKitchenClient,
  StaffKitchenDetail,
  StaffKitchenNote,
  StaffKitchenPage,
  StaffKitchenReader,
  StaffKitchenReaderFailure,
  StaffKitchenReaderOperation,
  StaffKitchenReading,
  StaffKitchenRequest,
  StaffKitchenStatus,
  StaffListedKitchen,
} from "./staff-kitchen-reader.js";
export { NeonStaffKitchenReader } from "./neon-staff-kitchen-reader.js";
export { FakeStaffKitchenReader } from "./fake-staff-kitchen-reader.js";
export type {
  PlantedStaffAccount,
  PlantedStaffKitchen,
  PlantedStaffNote,
  PlantedStaffRequest,
  PlantedStaffSentCopy,
  PlantedStaffStatus,
} from "./fake-staff-kitchen-reader.js";
export { StaffKitchenActionError } from "./staff-kitchen-actions-store.js";
export type {
  AddStaffNoteRequest,
  AddStaffNoteResult,
  SavedRequestStatus,
  SetRequestStatusRequest,
  SetRequestStatusResult,
  StaffActingSession,
  StaffKitchenActionFailure,
  StaffKitchenActionOperation,
  StaffKitchenActionRefusal,
  StaffKitchenActionsStore,
  UnhideKitchenRequest,
  UnhideKitchenResult,
} from "./staff-kitchen-actions-store.js";
export { NeonStaffKitchenActionsStore } from "./neon-staff-kitchen-actions-store.js";
export { FakeStaffKitchenActionsStore } from "./fake-staff-kitchen-actions-store.js";
export type {
  ActionAccountDirectory,
  FakeStaffKitchenActionsStoreOptions,
  HeldActionKitchen,
  HeldDesignNote,
  HeldRequestState,
} from "./fake-staff-kitchen-actions-store.js";
export { runMigrations } from "./migrate.js";
export type { MigrationRunSummary } from "./migrate.js";
export {
  MigrationChecksumMismatchError,
  MigrationError,
  MigrationExecutionError,
  MigrationSequenceError,
} from "./migration-errors.js";
export {
  deleteDesignsForTests,
  findDesignIdsForTests,
} from "./delete-designs-for-tests.js";
export { findWriteTokenHashesForTests } from "./find-write-token-hashes-for-tests.js";
export { countContactSubmissionsForTests } from "./count-contact-submissions-for-tests.js";
export { deleteContactSubmissionsForTests } from "./delete-contact-submissions-for-tests.js";
export { countCspReportsForTests } from "./count-csp-reports-for-tests.js";
export { deleteCspReportsForTests } from "./delete-csp-reports-for-tests.js";
export { deleteRateLimitCountersForTests } from "./delete-rate-limit-counters-for-tests.js";
export type { RemovedRateLimitCounters } from "./delete-rate-limit-counters-for-tests.js";
export {
  countStaffFixturesForTests,
  newStaffFixtureMarker,
  plantStaffAccountForTests,
  plantStaffAuditEventForTests,
  plantStaffDesignForTests,
  plantStaffNoteForTests,
  plantStaffRequestForTests,
  plantStaffRequestStateForTests,
  removeStaffFixturesForTests,
} from "./staff-fixtures-for-tests.js";
export type {
  PlantedStaffFixtureAccount,
  PlantedStaffFixtureRequest,
  StaffFixtureAccountSpec,
  StaffFixtureAuditEventSpec,
  StaffFixtureCounts,
  StaffFixtureDesignKind,
  StaffFixtureDesignSpec,
  StaffFixtureNoteSpec,
  StaffFixtureRequestStateSpec,
  StaffFixtureRole,
  StaffFixtureScope,
} from "./staff-fixtures-for-tests.js";
// The M10 price dashboard's ports (plan §8.4 c): contracts only, implemented by lane S.
export {
  ALREADY_CLAIMED,
  AVAILABILITY_CHANGED_MEANWHILE,
  AVAILABILITY_REVISION_NOT_FOUND,
  CHANGED_MEANWHILE,
  DashboardStoreError,
  DISPLAYED_REVISION_AHEAD,
  INITIAL_REVISION,
  NEVER_RECORDED,
  NO_ACTIVE_VERSION,
  NONE_SAVED,
  REVISION_AHEAD,
  UNKNOWN_VERSION,
  VERSION_NOT_FOUND,
} from "./m10-ports.js";
export type {
  AcknowledgedPrices,
  ActivationAuditRecord,
  ActivePriceVersion,
  AlreadyClaimed,
  AvailabilityChangedMeanwhile,
  AvailabilityRevisionNotFound,
  CatalogueAvailabilityStore,
  ChangedMeanwhile,
  ClaimDigestDayResult,
  DashboardAuditRecord,
  DashboardStoreFailure,
  DashboardStoreOperation,
  DigestCustomer,
  DigestDayKey,
  DigestEligibleKitchen,
  DigestedKitchen,
  DisplayedRevisionAhead,
  KitchenChangeStore,
  KitchenDefaultsStore,
  KitchenUsageReader,
  MarkKitchenSeenRequest,
  MarkKitchenSeenResult,
  NeverRecorded,
  NoActiveVersion,
  NoneSaved,
  PriceBookStore,
  PublishAuditRecord,
  PricePublishedAuditInput,
  PriceDraft,
  PriceNoticeStore,
  PriceVersionPage,
  PriceVersionPageRequest,
  PriceVersionSummary,
  PublishPriceBookRequest,
  PublishPriceBookResult,
  ReadAcknowledgedPricesResult,
  ReadActiveVersionResult,
  ReadAvailabilityAtResult,
  ReadKitchenDefaultsResult,
  ReadVersionResult,
  RecordAcknowledgedPricesResult,
  RevisionAhead,
  SavedKitchenDefaults,
  SaveKitchenDefaultsRequest,
  SaveKitchenDefaultsResult,
  SetItemActiveRequest,
  SetItemActiveResult,
  StoredPriceVersion,
  UnknownVersion,
  VersionNotFound,
  WriteDraftRequest,
  WriteDraftResult,
} from "./m10-ports.js";
// The fakes of those ports. They share one audit log, one availability head and one price book where the real stores
// share tables, so a test builds them together (`tests/support/fake-dashboard-world.ts`).
export {
  FakeDashboardAuditLedger,
  FakeRevisionHead,
} from "./fake-dashboard-support.js";
export type {
  FakeDashboardAuditLedgerOptions,
  HeldDashboardAuditEvent,
  StageDashboardAuditRequest,
  StagedDashboardAudit,
} from "./fake-dashboard-support.js";
export {
  FakePriceBookStore,
  PRICE_VERSION_PAGE_SIZE,
} from "./fake-price-book-store.js";
export type { FakePriceBookStoreOptions } from "./fake-price-book-store.js";
export { FakeCatalogueAvailabilityStore } from "./fake-catalogue-availability-store.js";
export type { FakeCatalogueAvailabilityStoreOptions } from "./fake-catalogue-availability-store.js";
export { FakeKitchenDefaultsStore } from "./fake-kitchen-defaults-store.js";
export type {
  FakeKitchenDefaultsStoreOptions,
  HeldDesignUsage,
} from "./fake-kitchen-defaults-store.js";
export { FakeKitchenChangeStore } from "./fake-kitchen-change-store.js";
export type {
  FakeKitchenChangeStoreOptions,
  HeldChangeKitchen,
  HeldDigestRound,
  HeldSeenMark,
} from "./fake-kitchen-change-store.js";
export { FakePriceNoticeStore } from "./fake-price-notice-store.js";
export type { FakePriceNoticeStoreOptions } from "./fake-price-notice-store.js";
export { loadEnvLocal } from "./load-env.js";
export {
  assertSafeTestDatabaseUrl,
  resolveTestDatabaseUrl,
} from "./test-database-url.js";
