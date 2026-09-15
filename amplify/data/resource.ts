import { type ClientSchema, a, defineData, defineFunction } from '@aws-amplify/backend';

/**
 * DATA MODEL + AUTHORIZATION
 *
 * Read docs/AWS-AUTHZ-DESIGN.md before changing anything here.
 *
 * The governing rule: AppSync authorization is identity-based only. It cannot
 * express "readable when publishedAt is set" or "readable when response is
 * yes". So co-hosts get NO direct read access to models. Every member-facing
 * read goes through `memberApi`, a Lambda that applies the value-based
 * filtering in trusted server code.
 *
 * That Lambda is the analogue of the old Postgres policy file. It is the one
 * place the privacy promises live, and it is where the tests point.
 */

export const memberApi = defineFunction({
  name: 'member-api',
  entry: './../functions/member-api/handler.ts',
  timeoutSeconds: 20,
  /**
   * Pinned to the data stack, deliberately.
   *
   * This function resolves AppSync fields (data depends on it) and, since
   * account deletion, also deletes Cognito users (it depends on auth) — while
   * data already depends on auth. In its own stack that is a three-way cycle
   * and CloudFormation refuses the whole deployment. Living inside the data
   * stack, which already depends on auth, removes the loop.
   */
  resourceGroupName: 'data',
});

/**
 * Keeps PublicEpisode in step with the ministry's YouTube channel.
 *
 * Runs on a schedule rather than on demand: the public screens must render
 * instantly for a stranger who just installed the app, and must not depend on
 * YouTube being reachable at that moment.
 */
export const youtubeSync = defineFunction({
  name: 'youtube-sync',
  entry: './../functions/youtube-sync/handler.ts',
  timeoutSeconds: 60,
  schedule: 'every 2h',
});

/** Shapes returned to co-hosts. Deliberately narrower than the models. */
const PublicProfile = a.customType({
  id: a.string(),
  displayName: a.string(),
  timezone: a.string(),
});

const SessionView = a.customType({
  id: a.string(),
  title: a.string(),
  topic: a.string(),
  questionsCovered: a.string(),
  scheduledAt: a.datetime(),
  durationMinutes: a.integer(),
  joinUrl: a.string(),
  guestName: a.string(),
  guestBlurb: a.string(),
  guestUrl: a.string(),
  guestReturning: a.boolean(),
  attendeeCount: a.integer(),
  /** Set only when an intake question of the CALLER's is linked to this session. */
  yourQuestion: a.string(),
});

const NoteView = a.customType({
  id: a.string(),
  title: a.string(),
  body: a.string(),
  linkUrl: a.string(),
  linkLabel: a.string(),
  publishedAt: a.datetime(),
  read: a.boolean(),
});

const EpisodeView = a.customType({
  id: a.string(),
  title: a.string(),
  url: a.string(),
  number: a.integer(),
  publishedAt: a.datetime(),
});

const schema = a
  .schema({
    PublicProfile,
    SessionView,
    NoteView,
    EpisodeView,

    /* ------------------------------------------------------------ people */

    Profile: a
      .model({
        owner: a.string(),
        email: a.string().required(),
        displayName: a.string().required(),
        role: a.enum(['member', 'admin']),
        timezone: a.string(),
        status: a.enum(['pending', 'active', 'removed']),
      })
      // Own row readable/updatable by the owner; leadership sees everyone.
      // Co-hosts do NOT get a blanket read — the roster comes from memberApi,
      // which returns display names only, never emails.
      .authorization((allow) => [
        // READ ONLY, deliberately. 'update' let a PENDING account set its own
        // status to 'active' and walk straight into the member API, and let a
        // co-host set role: admin. Profile edits go through updateMyProfile on
        // the Lambda, which only ever touches displayName and timezone.
        allow.ownerDefinedIn('owner').to(['read']),
        allow.group('leadership'),
      ]),

    Season: a
      .model({
        name: a.string().required(),
        isCurrent: a.boolean().default(false),
        startsAt: a.date(),
        endsAt: a.date(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    Membership: a
      .model({
        profileId: a.string().required(),
        seasonId: a.string().required(),
        kind: a.enum(['cohort', 'alum']),
      })
      .authorization((allow) => [allow.group('leadership')]),

    Invite: a
      .model({
        email: a.string().required(),
        seasonId: a.string().required(),
        code: a.string().required(),
        expiresAt: a.datetime(),
        redeemedAt: a.datetime(),
        redeemedBy: a.string(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    /* ----------------------------------------------------------- content */

    Guest: a
      .model({
        name: a.string().required(),
        photoUrl: a.string(),
        blurb: a.string(),
        externalUrl: a.string(),
        // Leadership-only. Never leaves the model — memberApi does not copy it
        // into SessionView.
        adminNotes: a.string(),
        returningOverride: a.boolean(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    Recording: a
      .model({
        seasonId: a.string().required(),
        guestId: a.string(),
        title: a.string().required(),
        topic: a.string(),
        questionsCovered: a.string(),
        description: a.string(),
        scheduledAt: a.datetime().required(),
        durationMinutes: a.integer().default(90),
        joinUrl: a.string(),
        // A draft is not "hidden from" co-hosts — nothing they can call ever
        // returns it. publishedAt is filtered inside memberApi.
        publishedAt: a.datetime(),
        announceAt: a.datetime(),
        announcedAt: a.datetime(),
        source: a.enum(['manual', 'calendly']),
        calendlyEventId: a.string(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    /**
     * The private half of an RSVP. Holds the actual yes/no. Readable by its
     * owner and leadership, and by nobody else, ever.
     */
    Rsvp: a
      .model({
        owner: a.string(),
        profileId: a.string().required(),
        recordingId: a.string().required(),
        response: a.enum(['yes', 'no']),
        note: a.string(),
        respondedAt: a.datetime(),
      })
      .authorization((allow) => [
        // READ ONLY. A direct write let a co-host set profileId to a PEER's id
        // (owner still their own sub), poisoning leadership's responses view,
        // and let Rsvp and Attendee disagree. submitRsvp is the only writer.
        allow.ownerDefinedIn('owner').to(['read']),
        allow.group('leadership'),
      ]),

    /**
     * The public half. Exists ONLY when someone said yes — answering "no"
     * deletes the row. This is the structural version of the attendance
     * asymmetry in spec §5.3: a decline has no record to leak.
     *
     * Written exclusively by memberApi so attendance cannot be forged by a
     * client. Co-hosts read it only through listAttendees.
     */
    Attendee: a
      .model({
        recordingId: a.string().required(),
        profileId: a.string().required(),
        displayName: a.string().required(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    EventItem: a
      .model({
        seasonId: a.string(),
        title: a.string().required(),
        kind: a.string(),
        startsAt: a.datetime().required(),
        endsAt: a.datetime(),
        location: a.string(),
        description: a.string(),
        publishedAt: a.datetime(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    /* --------------------------------------------------------- questions */

    /** "I can't attend — ask this for me." Author + leadership only. */
    Question: a
      .model({
        owner: a.string(),
        profileId: a.string().required(),
        recordingId: a.string().required(),
        body: a.string().required(),
      })
      .authorization((allow) => [
        // READ ONLY. 'create' let a co-host submit a question under a PEER's
        // profileId — the client supplies that field. submitQuestion on the
        // Lambda sets it from the verified caller instead.
        allow.ownerDefinedIn('owner').to(['read']),
        allow.group('leadership'),
      ]),

    /** Season-building questions. Spec §5.4 — the content engine. */
    IntakeQuestion: a
      .model({
        owner: a.string(),
        profileId: a.string().required(),
        seasonId: a.string().required(),
        body: a.string().required(),
        kind: a.enum(['question', 'objection']),
        source: a.enum(['form', 'retreat', 'app']),
      })
      .authorization((allow) => [
        // READ ONLY — same profileId-impersonation hole as Question. Nothing
        // in the app writes these from a member; intake arrives from the form
        // and the retreat, both of which leadership imports.
        allow.ownerDefinedIn('owner').to(['read']),
        allow.group('leadership'),
      ]),

    /**
     * Which recording answers which intake question. Leadership-only —
     * co-hosts learn about their own via SessionView.yourQuestion, which
     * memberApi only populates for published recordings.
     */
    QuestionLink: a
      .model({
        intakeQuestionId: a.string().required(),
        recordingId: a.string().required(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    /* --------------------------------------------------------- sensitive */

    /**
     * The most sensitive model. Co-hosts were told at signup that only the FSR
     * team sees these. There is deliberately no peer-read rule and there must
     * never be one.
     */
    PrayerRequest: a
      .model({
        owner: a.string(),
        profileId: a.string().required(),
        body: a.string().required(),
        status: a.string().default('open'),
      })
      .authorization((allow) => [
        // LEADERSHIP ONLY — no owner rule at all. Co-hosts were told the FSR
        // team is the only audience; the tightest reading of that is that the
        // model is not addressable from a member session in any direction.
        // Writes go through submitPrayerRequest on the Lambda, which sets
        // profileId from the verified caller. An earlier version let the owner
        // create (so one co-host could file under another's profileId) and
        // read (so `listPrayerRequests` returned rows to a co-host at all).
        allow.group('leadership'),
      ]),

    /* --------------------------------------------------------- messaging */

    Note: a
      .model({
        title: a.string().required(),
        body: a.string().required(),
        linkUrl: a.string(),
        linkLabel: a.string(),
        authorId: a.string(),
        audience: a.enum(['all', 'cohort', 'alumni', 'custom']),
        recipientIds: a.string().array(),
        publishedAt: a.datetime(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    Receipt: a
      .model({
        owner: a.string(),
        profileId: a.string().required(),
        targetType: a.enum(['note', 'recording', 'event']),
        targetId: a.string().required(),
        deliveredAt: a.datetime(),
        openedAt: a.datetime(),
      })
      .authorization((allow) => [
        // READ ONLY. Receipts drive leadership's "who has opened this" view, so
        // a client that can write them can fake engagement — or mark a peer as
        // having read something. markRead is the only writer.
        allow.ownerDefinedIn('owner').to(['read']),
        allow.group('leadership'),
      ]),

    NotificationLog: a
      .model({
        profileId: a.string().required(),
        kind: a.string().required(),
        class: a.enum(['broadcast', 'time_sensitive', 'internal']),
        targetType: a.string(),
        targetId: a.string(),
        sentAt: a.datetime(),
        suppressedReason: a.string(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    Episode: a
      .model({
        title: a.string().required(),
        url: a.string(),
        artworkUrl: a.string(),
        number: a.integer(),
        publishedAt: a.datetime(),
      })
      .authorization((allow) => [allow.group('leadership')]),

    /* ------------------------------------------------- the public surface */

    /**
     * THE ONLY MODEL AN ANONYMOUS VISITOR CAN READ.
     *
     * The App Store will not approve an app whose every screen sits behind an
     * invitation-only login (Guideline 4.2, and 5.1.1(v)). So the app needs a
     * public half — and that means the first unauthenticated door into a
     * backend whose entire design is that co-hosts cannot reach each other's
     * data.
     *
     * Two rules hold that door shut:
     *
     *   1. NOTHING PRIVATE LIVES HERE. Every field below is already public on
     *      YouTube. There is no profileId, no email, no join URL, no
     *      relationship to a Recording, a Season or a co-host. If a future
     *      field cannot be read aloud from a stage, it does not belong in this
     *      model — put it on Episode, which stays leadership-only.
     *   2. GUEST ACCESS IS READ, AND ONLY HERE. `allow.guest()` appears
     *      exactly once in this file. Writes come from the youtube-sync
     *      function or from leadership. An anonymous caller that can write is
     *      an anonymous caller that can deface the ministry's front page.
     *
     * scripts/security-test.mjs signs in as nobody at all and proves both.
     */
    PublicEpisode: a
      .model({
        videoId: a.string().required(),
        title: a.string().required(),
        url: a.string().required(),
        thumbnailUrl: a.string(),
        publishedAt: a.datetime().required(),
        // YouTube shorts and full episodes share a feed; the app lists them
        // separately so the episode list is not drowned in clips.
        kind: a.enum(['episode', 'short']),
        blurb: a.string(),
      })
      .authorization((allow) => [
        allow.guest().to(['read']),
        allow.authenticated().to(['read']),
        allow.group('leadership'),
      ]),

    /* ------------------------------------------------- member-facing API */
    /* Everything a co-host can do. Each one filters on values the model
       authorization rules cannot see. */

    listSessions: a
      .query()
      .returns(a.ref('SessionView').array())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    getSession: a
      .query()
      .arguments({ id: a.string().required() })
      .returns(a.ref('SessionView'))
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    /** Names of people who said YES. Never returns decliners or silence. */
    sessionAttendees: a
      .query()
      .arguments({ recordingId: a.string().required() })
      .returns(a.ref('PublicProfile').array())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    myNotes: a
      .query()
      .returns(a.ref('NoteView').array())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    publishedEpisodes: a
      .query()
      .returns(a.ref('EpisodeView').array())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    /** Writes Rsvp and creates/removes the matching Attendee atomically. */
    submitRsvp: a
      .mutation()
      .arguments({
        recordingId: a.string().required(),
        response: a.string().required(),
        note: a.string(),
      })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    markRead: a
      .mutation()
      .arguments({ targetType: a.string().required(), targetId: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    /**
     * The only way a co-host edits her own profile. Note what is NOT an
     * argument: role, status, owner. Those were writable when this went
     * through the model directly, which is how a pending account could
     * activate itself.
     */
    updateMyProfile: a
      .mutation()
      .arguments({ displayName: a.string(), timezone: a.string() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    /** "I can't attend — ask this for me." profileId comes from the caller. */
    submitQuestion: a
      .mutation()
      .arguments({ recordingId: a.string().required(), body: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    /** Goes only to leadership. profileId comes from the caller, never the client. */
    submitPrayerRequest: a
      .mutation()
      .arguments({ body: a.string().required() })
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),

    /**
     * Erase yourself.
     *
     * Required by Google Play for any app with accounts, and expected by App
     * Review; the app already had a "Delete my account and data" link that did
     * nothing, which is its own Guideline 2.1 problem.
     *
     * Deliberately a Lambda and not a model delete. A co-host's data is spread
     * across nine tables plus Cognito, most of which she cannot touch
     * directly — and must not be able to, since a client that could delete
     * Rsvp rows could delete someone else's. The caller supplies no id: the
     * only account this can delete is the one holding the token.
     */
    deleteMyAccount: a
      .mutation()
      .returns(a.json())
      .authorization((allow) => [allow.authenticated()])
      .handler(a.handler.function(memberApi)),
  })
  .authorization((allow) => [allow.resource(memberApi), allow.resource(youtubeSync)]);

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Still userPool by default — every private model resolves through a
    // Cognito user token exactly as before. The identity pool needs no config
    // here; defineAuth supplies it, and allow.guest() binds to its
    // unauthenticated role. A client reaches it only by asking for
    // authMode: 'identityPool', and the only thing it can reach is
    // PublicEpisode.
    defaultAuthorizationMode: 'userPool',
  },
});
