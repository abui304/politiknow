/**
 * Words Congress uses, in plain language. Written by hand and kept neutral: each entry says what something is
 * and what it does, never whether it's good. Shown when someone taps an underlined term, on the glossary page,
 * and at the top of search results.
 *
 * `aliases` are the phrasings that appear in the official record (vote questions, floor schedules, bill
 * actions), matched without regard to case. Entries with `autolink: false` are on the glossary page and in
 * search, but aren't underlined in the app's text: they're either too common to mark or rarely appear as-is.
 */

export type GlossaryGroup = 'process' | 'floor' | 'votes' | 'money' | 'kinds' | 'people';

export type GlossaryEntry = {
  id: string;
  term: string;
  group: GlossaryGroup;
  definition: string;
  aliases?: string[];
  autolink?: boolean;
  see?: string[];
};

export const GROUPS: { id: GlossaryGroup; title: string }[] = [
  { id: 'process', title: 'How a bill moves' },
  { id: 'floor', title: 'On the floor' },
  { id: 'votes', title: 'Votes' },
  { id: 'money', title: 'Money' },
  { id: 'kinds', title: 'Kinds of bills, and how they’re linked' },
  { id: 'people', title: 'People and places' },
];

export const GLOSSARY: GlossaryEntry[] = [
  // How a bill moves
  {
    id: 'introduced',
    term: 'Introduced',
    group: 'process',
    definition:
      'A member formally files a bill in their chamber. It gets a number (like H.R. 1234 or S. 56) and is usually sent to a committee the same day.',
    aliases: ['introduced in house', 'introduced in senate'],
    autolink: false,
    see: ['referred', 'sponsor'],
  },
  {
    id: 'sponsor',
    term: 'Sponsor',
    group: 'process',
    definition: 'The member who introduces a bill and is its main author. Each bill has exactly one sponsor.',
    autolink: false,
    see: ['cosponsor'],
  },
  {
    id: 'cosponsor',
    term: 'Cosponsor',
    group: 'process',
    definition:
      'A member who formally signs on to support someone else’s bill. Cosponsors can join any time before the bill passes; a long or bipartisan list is often read as a sign of support.',
    aliases: ['cosponsor', 'cosponsors', 'cosponsored', 'cosponsorship'],
    see: ['sponsor'],
  },
  {
    id: 'referred',
    term: 'Referred to committee',
    group: 'process',
    definition:
      'The bill is sent to the committee (or committees) that handle its subject. Most bills stop here: committees choose which ones to take up.',
    aliases: ['referred to the committee', 'referred to the subcommittee', 'referred to committee', 'referred to the house committee', 'referred to the senate committee'],
    see: ['hearing', 'markup'],
  },
  {
    id: 'hearing',
    term: 'Hearing',
    group: 'process',
    definition:
      'A committee meeting where members question witnesses (officials, experts, advocates) about a bill or issue. Hearings gather information; no vote is taken.',
    aliases: ['hearing', 'hearings', 'hearings held'],
  },
  {
    id: 'markup',
    term: 'Markup',
    group: 'process',
    definition:
      'A committee meeting where members debate a bill, change it with amendments, and vote on whether to send it on to the full chamber.',
    aliases: ['markup', 'mark up', 'mark-up', 'committee consideration and mark-up session'],
    see: ['reported', 'amendment'],
  },
  {
    id: 'reported',
    term: 'Reported',
    group: 'process',
    definition:
      'The committee has voted to send the bill to the full chamber, usually with a written report explaining it. It can now be scheduled for a floor vote, though many reported bills never are.',
    aliases: ['ordered to be reported', 'ordered reported', 'reported by', 'reported to', 'reported with an amendment', 'reported without amendment'],
    see: ['calendar'],
  },
  {
    id: 'calendar',
    term: 'Placed on the calendar',
    group: 'process',
    definition:
      'The bill is on the chamber’s list of business that could come up for a vote. Being on the calendar doesn’t mean a vote is scheduled.',
    aliases: ['placed on the union calendar', 'placed on the house calendar', 'placed on senate legislative calendar', 'union calendar', 'legislative calendar'],
  },
  {
    id: 'amendment',
    term: 'Amendment',
    group: 'process',
    definition:
      'A proposed change to a bill: adding, removing or rewriting text. Amendments get their own votes, in committee or on the floor.',
    aliases: ['amendment', 'amendments', 'as amended'],
    see: ['substitute'],
  },
  {
    id: 'substitute',
    term: 'Amendment in the nature of a substitute',
    group: 'process',
    definition:
      'An amendment that replaces the whole text of a bill with a new version. Committees often use one to adopt their revised draft in a single step.',
    aliases: ['amendment in the nature of a substitute', 'in the nature of a substitute'],
  },
  {
    id: 'engrossed',
    term: 'Engrossed',
    group: 'process',
    definition: 'The official copy of a bill as one chamber passed it, with all of its adopted amendments, sent to the other chamber.',
    aliases: ['engrossed'],
  },
  {
    id: 'concur',
    term: 'Concur',
    group: 'process',
    definition:
      'To agree to the other chamber’s changes. Both chambers must pass the exact same text, so if the Senate changes a House bill, the House can concur and send it to the President.',
    aliases: ['concur', 'concurring', 'concurred', 'concurrence', 'motion to concur'],
    see: ['conference'],
  },
  {
    id: 'conference',
    term: 'Conference committee',
    group: 'process',
    definition:
      'A temporary panel of House and Senate members that works out the differences between the two chambers’ versions of a bill. Its agreed text, the conference report, then needs a vote in both chambers.',
    aliases: ['conference committee', 'conference report', 'conferees'],
  },
  {
    id: 'enrolled',
    term: 'Enrolled',
    group: 'process',
    definition: 'The final copy of a bill that has passed both chambers in identical form, signed by their leaders and sent to the President.',
    aliases: ['enrolled', 'enrolled bill', 'presented to president', 'presented to the president'],
    see: ['veto'],
  },
  {
    id: 'public-law',
    term: 'Became law',
    group: 'process',
    definition:
      'The President signed the bill, or didn’t act on it for 10 days (not counting Sundays) while Congress was in session, or Congress overrode a veto. It gets a public law number, like P.L. 118-42.',
    aliases: ['became public law', 'public law', 'signed by president', 'signed by the president', 'became law'],
  },
  {
    id: 'veto',
    term: 'Veto',
    group: 'process',
    definition:
      'The President rejects a bill and returns it to Congress, usually with a message explaining why. Congress can still make it law with a two-thirds vote in both chambers.',
    aliases: ['veto', 'vetoed', 'veto message'],
    see: ['override', 'pocket-veto'],
  },
  {
    id: 'override',
    term: 'Veto override',
    group: 'process',
    definition:
      'Congress makes a vetoed bill law anyway. It takes two-thirds of those voting in the House and in the Senate. The vote question reads “objections of the President to the contrary notwithstanding.”',
    aliases: ['override', 'veto override', 'overriding the veto', 'objections of the president notwithstanding', 'objections of the president to the contrary notwithstanding'],
  },
  {
    id: 'pocket-veto',
    term: 'Pocket veto',
    group: 'process',
    definition:
      'If Congress has adjourned and the President doesn’t sign a bill within 10 days, the bill dies. Congress can’t override this kind of veto; the bill has to start over.',
    aliases: ['pocket veto', 'pocket vetoed'],
  },

  // On the floor
  {
    id: 'suspension',
    term: 'Suspension of the rules',
    group: 'floor',
    definition:
      'A House shortcut for bills expected to have wide support. Debate is limited to 40 minutes, no amendments are allowed, and passing takes two-thirds of those voting instead of a simple majority.',
    aliases: ['under suspension of the rules', 'suspension of the rules', 'suspend the rules', 'under suspension', 'motion to suspend the rules'],
    see: ['two-thirds'],
  },
  {
    id: 'rule',
    term: 'Rule (House)',
    group: 'floor',
    definition:
      'A short House resolution, written by the Rules Committee, that sets the terms for debating a bill: how long, and which amendments may be offered. The House votes on the rule first, then the bill.',
    aliases: ['under a rule', 'providing for consideration', 'special rule', 'rules committee', 'committee on rules'],
    see: ['previous-question'],
  },
  {
    id: 'previous-question',
    term: 'Previous question',
    group: 'floor',
    definition:
      'A House vote to end debate and vote right away on the measure at hand, most often a rule. If it fails, the minority party may offer its own amendment, so these votes usually split along party lines.',
    aliases: ['previous question', 'ordering the previous question', 'order the previous question'],
  },
  {
    id: 'recommit',
    term: 'Motion to recommit',
    group: 'floor',
    definition:
      'A last House vote, just before final passage, on sending a bill back to committee. The minority party traditionally offers it; if it passes, the bill leaves the floor.',
    aliases: ['motion to recommit', 'recommit'],
  },
  {
    id: 'table',
    term: 'Motion to table',
    group: 'floor',
    definition:
      'A vote to set something aside without debating it. If the motion passes, the amendment, motion or measure it targets is effectively killed.',
    aliases: ['motion to table', 'to table', 'tabled', 'laid on the table'],
  },
  {
    id: 'proceed',
    term: 'Motion to proceed',
    group: 'floor',
    definition:
      'A Senate vote to begin considering a bill. In the Senate, even starting debate can be filibustered, so this step sometimes needs its own cloture vote.',
    aliases: ['motion to proceed'],
    see: ['cloture'],
  },
  {
    id: 'cloture',
    term: 'Cloture',
    group: 'floor',
    definition:
      'A Senate vote to end debate and move toward a final vote. For most bills it takes 60 senators; for nominations it takes a simple majority. It’s how the Senate ends a filibuster.',
    aliases: ['cloture', 'cloture motion', 'invoke cloture', 'cloture vote'],
    see: ['filibuster'],
  },
  {
    id: 'filibuster',
    term: 'Filibuster',
    group: 'floor',
    definition:
      'Using the Senate’s unlimited debate to delay or block a vote. Because ending debate usually takes 60 votes, most bills need 60 supporters in the Senate, not just a majority.',
    aliases: ['filibuster', 'filibustered', 'filibusters'],
    see: ['cloture'],
  },
  {
    id: 'unanimous-consent',
    term: 'Unanimous consent',
    group: 'floor',
    definition:
      'Doing something without a recorded vote because no member present objects. Much routine business, especially in the Senate, moves this way.',
    aliases: ['unanimous consent', 'by unanimous consent', 'without objection'],
  },
  {
    id: 'quorum',
    term: 'Quorum',
    group: 'floor',
    definition:
      'The minimum number of members needed to do business: a majority of the chamber. A quorum call takes attendance, and in the Senate it’s often used to pause the floor.',
    aliases: ['quorum', 'quorum call'],
  },
  {
    id: 'committee-of-the-whole',
    term: 'Committee of the Whole',
    group: 'floor',
    definition:
      'The full House sitting under simpler rules to debate and amend a bill. It needs fewer members present; the final vote happens after the House returns to its normal form.',
    aliases: ['committee of the whole'],
  },
  {
    id: 'discharge',
    term: 'Discharge petition',
    group: 'floor',
    definition:
      'A way to force a House vote on a bill a committee won’t release. If a majority of the House (218 members) signs, the bill can be brought to the floor without leadership’s consent.',
    aliases: ['discharge petition', 'motion to discharge', 'discharged'],
  },
  {
    id: 'point-of-order',
    term: 'Point of order',
    group: 'floor',
    definition:
      'A member’s objection that something breaks the chamber’s rules, like a bill that exceeds the budget. A motion to waive asks the chamber to set that rule aside for this vote.',
    aliases: ['point of order', 'motion to waive', 'waive all applicable budgetary discipline'],
  },
  {
    id: 'en-bloc',
    term: 'En bloc',
    group: 'floor',
    definition: 'Handling several items, often amendments or nominations, together in a single vote.',
    aliases: ['en bloc'],
  },
  {
    id: 'pro-forma',
    term: 'Pro forma session',
    group: 'floor',
    definition:
      'A brief meeting, sometimes just minutes long, with no votes. Chambers hold them to meet constitutional requirements during breaks without formally adjourning.',
    aliases: ['pro forma', 'pro forma session'],
  },
  {
    id: 'journal',
    term: 'Approving the Journal',
    group: 'floor',
    definition: 'A House vote to approve the official minutes of the previous day. It’s routine and doesn’t change any bill.',
    aliases: ['approving the journal', 'the journal'],
  },
  {
    id: 'nomination',
    term: 'Nomination',
    group: 'floor',
    definition:
      'The President’s choice for a post like a judge, ambassador or cabinet secretary. The Senate votes to confirm or reject; the House has no role.',
    aliases: ['nomination', 'nominations', 'on the nomination', 'confirmation'],
  },

  // Votes
  {
    id: 'roll-call',
    term: 'Roll call vote',
    group: 'votes',
    definition:
      'A vote in which each member’s position is recorded by name. These are the votes PolitiKNOW can show member by member.',
    aliases: ['roll call', 'roll-call', 'recorded vote', 'yea-and-nay vote', 'yeas and nays'],
    see: ['voice-vote'],
  },
  {
    id: 'voice-vote',
    term: 'Voice vote',
    group: 'votes',
    definition:
      'Members call out “aye” or “no” together and the presiding officer judges which side is louder. Nobody’s individual vote is recorded.',
    aliases: ['voice vote', 'passed by voice vote', 'agreed to by voice vote'],
  },
  {
    id: 'yea-nay',
    term: 'Yea and Nay',
    group: 'votes',
    definition:
      'Yes and no on a recorded vote. The House records them as Yea and Nay or as Aye and No depending on how the vote is taken; they mean the same thing.',
    aliases: ['yea', 'nay', 'aye'],
    autolink: false,
  },
  {
    id: 'present',
    term: 'Present',
    group: 'votes',
    definition: 'A member who answers “present” is counted as there but takes no side. It’s different from Not Voting, which means they didn’t vote at all.',
    autolink: false,
    see: ['not-voting'],
  },
  {
    id: 'not-voting',
    term: 'Not Voting',
    group: 'votes',
    definition: 'The member didn’t cast a vote, whether because of absence, illness, a conflict or another reason. The record doesn’t say why.',
    autolink: false,
  },
  {
    id: 'two-thirds',
    term: 'Two-thirds vote',
    group: 'votes',
    definition:
      'Some votes need two-thirds of members voting, not a simple majority: overriding a veto, passing a House bill under suspension of the rules, and proposing a constitutional amendment.',
    aliases: ['two-thirds', '2/3'],
  },
  {
    id: 'passage',
    term: 'On passage',
    group: 'votes',
    definition: 'The final vote on a bill in one chamber. If it passes, the bill goes to the other chamber, or to the President if both have now passed it.',
    aliases: ['on passage'],
    autolink: false,
  },

  // Money
  {
    id: 'cbo',
    term: 'CBO cost estimate',
    group: 'money',
    definition:
      'The Congressional Budget Office is Congress’s nonpartisan scorekeeper. Its cost estimates project how a bill would change federal spending and revenue, usually over 10 years.',
    aliases: ['congressional budget office', 'cbo', 'cost estimate', 'cost estimates'],
  },
  {
    id: 'appropriations',
    term: 'Appropriations',
    group: 'money',
    definition:
      'Bills that actually provide money for federal agencies and programs for a fiscal year. Twelve regular appropriations bills fund most of the government each year.',
    aliases: ['appropriations', 'appropriation', 'appropriations act', 'appropriations committee'],
    see: ['authorization', 'continuing-resolution'],
  },
  {
    id: 'authorization',
    term: 'Authorization',
    group: 'money',
    definition:
      'A law that creates or continues a program and sets its rules, sometimes with a spending limit. It doesn’t provide the money itself; that takes an appropriation.',
    aliases: ['authorization', 'authorizations', 'reauthorization', 'authorization act'],
  },
  {
    id: 'continuing-resolution',
    term: 'Continuing resolution',
    group: 'money',
    definition:
      'A stopgap that keeps the government funded, usually at current levels, when the yearly appropriations bills aren’t done in time. Without one, unfunded agencies shut down.',
    aliases: ['continuing resolution', 'continuing appropriations', 'stopgap'],
  },
  {
    id: 'omnibus',
    term: 'Omnibus',
    group: 'money',
    definition: 'One large bill that combines several appropriations bills, or many unrelated measures, so they can pass in a single vote.',
    aliases: ['omnibus', 'minibus'],
  },
  {
    id: 'reconciliation',
    term: 'Budget reconciliation',
    group: 'money',
    definition:
      'A special process for bills that change taxes, spending or the debt limit to match a budget resolution. In the Senate, debate is limited, so it can pass with a simple majority instead of 60 votes.',
    aliases: ['reconciliation', 'budget reconciliation'],
  },
  {
    id: 'budget-resolution',
    term: 'Budget resolution',
    group: 'money',
    definition:
      'Congress’s budget plan for the year, setting overall spending and revenue targets. It isn’t signed by the President and doesn’t have the force of law.',
    aliases: ['budget resolution', 'concurrent resolution on the budget'],
  },
  {
    id: 'mandatory',
    term: 'Mandatory spending',
    group: 'money',
    definition:
      'Spending required by existing law without a yearly vote, like Social Security and Medicare. Also called direct spending. Most federal spending is mandatory.',
    aliases: ['mandatory spending', 'direct spending'],
    see: ['discretionary'],
  },
  {
    id: 'discretionary',
    term: 'Discretionary spending',
    group: 'money',
    definition: 'Spending Congress sets each year through appropriations bills, such as defense, education and transportation programs.',
    aliases: ['discretionary spending', 'discretionary'],
  },
  {
    id: 'deficit',
    term: 'Deficit and debt',
    group: 'money',
    definition:
      'The deficit is how much more the government spends than it takes in during one year. The debt is the total it owes, built up from past deficits.',
    aliases: ['deficit', 'deficits', 'national debt', 'federal debt'],
    see: ['debt-limit'],
  },
  {
    id: 'debt-limit',
    term: 'Debt limit',
    group: 'money',
    definition:
      'The legal cap on how much the Treasury can borrow to pay bills Congress has already approved. Congress raises or suspends it by law. Also called the debt ceiling.',
    aliases: ['debt limit', 'debt ceiling', 'statutory limit on the public debt'],
  },
  {
    id: 'paygo',
    term: 'PAYGO',
    group: 'money',
    definition: 'Pay-as-you-go: budget rules requiring that new tax cuts or mandatory spending be offset so they don’t add to the deficit.',
    aliases: ['paygo', 'pay-as-you-go'],
  },
  {
    id: 'earmark',
    term: 'Earmark',
    group: 'money',
    definition:
      'Money in a spending bill set aside for a specific project, often in one member’s district. Now officially called Community Project Funding (House) or congressionally directed spending (Senate).',
    aliases: ['earmark', 'earmarks', 'community project funding', 'congressionally directed spending'],
  },
  {
    id: 'fiscal-year',
    term: 'Fiscal year',
    group: 'money',
    definition: 'The federal government’s budget year, which runs from October 1 to September 30. Fiscal year 2027 starts October 1, 2026.',
    aliases: ['fiscal year', 'fiscal years'],
  },

  // Kinds of bills, and how they're linked
  {
    id: 'bill',
    term: 'Bill (H.R. and S.)',
    group: 'kinds',
    definition: 'A proposed law. House bills are numbered H.R., Senate bills S. To become law, a bill must pass both chambers in the same form and be signed by the President.',
    autolink: false,
  },
  {
    id: 'joint-resolution',
    term: 'Joint resolution',
    group: 'kinds',
    definition:
      'Works like a bill: it must pass both chambers and is usually signed by the President. Used for things like continuing resolutions, and for proposing constitutional amendments, which go to the states instead of the President.',
    aliases: ['joint resolution', 'h.j.res.', 's.j.res.'],
  },
  {
    id: 'concurrent-resolution',
    term: 'Concurrent resolution',
    group: 'kinds',
    definition: 'Passed by both chambers but not sent to the President, so it isn’t law. Used for shared business like the budget resolution or adjournment.',
    aliases: ['concurrent resolution', 'h.con.res.', 's.con.res.'],
  },
  {
    id: 'simple-resolution',
    term: 'Simple resolution',
    group: 'kinds',
    definition:
      'Passed by one chamber only, for its own business: setting House rules for a debate, honoring someone, or stating the chamber’s view. Numbered H.Res. or S.Res.; it isn’t law.',
    aliases: ['simple resolution'],
  },
  {
    id: 'companion',
    term: 'Companion bill',
    group: 'kinds',
    definition:
      'A matching bill introduced in the other chamber, so both can work on the same idea at once. Congress.gov marks exact matches as identical bills.',
    aliases: ['companion bill', 'companion bills', 'companion'],
    see: ['identical'],
  },
  {
    id: 'identical',
    term: 'Identical bill',
    group: 'kinds',
    definition: 'A bill whose text matches this one word for word, usually its companion in the other chamber.',
    aliases: ['identical bill', 'identical bills'],
  },
  {
    id: 'related',
    term: 'Related bill',
    group: 'kinds',
    definition:
      'A bill Congress’s record keepers linked to this one because it deals with the same subject. It may share some text, or take a different approach to the same problem.',
    aliases: ['related bill', 'related bills', 'related document', 'text similarities', 'similar text'],
  },
  {
    id: 'procedurally-related',
    term: 'Procedurally related',
    group: 'kinds',
    definition: 'Linked by procedure rather than subject: most often a House rule that sets the terms for debating this bill.',
    aliases: ['procedurally-related', 'procedurally related'],
    see: ['rule'],
  },
  {
    id: 'congress-number',
    term: 'A Congress (like the 119th)',
    group: 'kinds',
    definition:
      'Each Congress lasts two years, starting in January after an election. Bills that don’t become law by the end of a Congress expire and must be reintroduced with new numbers.',
    autolink: false,
  },

  // People and places
  {
    id: 'speaker',
    term: 'Speaker of the House',
    group: 'people',
    definition: 'The House’s presiding officer and leader of its majority party, elected by the full House. The Speaker largely controls which bills reach the floor.',
    autolink: false,
  },
  {
    id: 'majority-leader',
    term: 'Majority and minority leaders',
    group: 'people',
    definition:
      'Each party in each chamber elects a leader. In the Senate, the majority leader largely decides what comes to the floor; in the House that role is shared with the Speaker.',
    autolink: false,
  },
  {
    id: 'whip',
    term: 'Whip',
    group: 'people',
    definition: 'A party leader who counts votes ahead of time and works to keep the party’s members together on important votes.',
    autolink: false,
  },
  {
    id: 'delegate',
    term: 'Delegate and Resident Commissioner',
    group: 'people',
    definition:
      'House members representing D.C., Puerto Rico and U.S. territories. They can sponsor bills, serve and vote on committees, and speak on the floor, but can’t vote on passing bills.',
    aliases: ['delegate', 'resident commissioner'],
    autolink: false,
  },
  {
    id: 'at-large',
    term: 'At-large',
    group: 'people',
    definition: 'Representing a whole state rather than one district. States with only one House seat elect their representative at-large.',
    aliases: ['at-large', 'at large'],
  },
  {
    id: 'session',
    term: 'Session',
    group: 'people',
    definition: 'Each two-year Congress has two sessions, roughly one per calendar year. Bills stay alive from the first session into the second.',
    autolink: false,
  },
  {
    id: 'recess',
    term: 'Recess',
    group: 'people',
    definition: 'A break when a chamber isn’t meeting, like the August recess or a district work period, when members are usually home in their states.',
    aliases: ['recess', 'district work period', 'state work period'],
  },
  {
    id: 'lame-duck',
    term: 'Lame duck',
    group: 'people',
    definition: 'The stretch between November’s election and the new Congress in January, when members who lost or retired are still voting.',
    aliases: ['lame duck', 'lame-duck'],
    autolink: false,
  },
  {
    id: 'bipartisan',
    term: 'Bipartisan',
    group: 'people',
    definition: 'Supported by members of both parties. A bill’s cosponsor list or a vote’s party breakdown shows how bipartisan it is.',
    aliases: ['bipartisan'],
    autolink: false,
  },
];

export const byId: Record<string, GlossaryEntry> = Object.fromEntries(GLOSSARY.map((e) => [e.id, e]));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** Every alias that's underlined in text, longest first, so "motion to suspend the rules" beats "suspend the rules". */
const linkable: { alias: string; id: string }[] = GLOSSARY.filter((e) => e.autolink !== false)
  .flatMap((e) => (e.aliases ?? []).map((alias) => ({ alias: alias.toLowerCase(), id: e.id })))
  .sort((a, b) => b.alias.length - a.alias.length);

const aliasToId = new Map(linkable.map((l) => [l.alias, l.id]));

// Whole words only. Lookarounds instead of \b, because some aliases end in punctuation ("h.j.res.").
const pattern = new RegExp(`(?<![\\w-])(${linkable.map((l) => escape(l.alias)).join('|')})(?![\\w-])`, 'gi');

export type Segment = { text: string; id?: string };

/** Splits text into plain pieces and glossary terms (each term's first use in the text only). */
export function segment(text: string): Segment[] {
  const out: Segment[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const id = aliasToId.get(m[0].toLowerCase());
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: m[0], id });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const normalize = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();

/**
 * Glossary entries matching what someone typed: by term or alias, whole or from the start. `exact` keeps only
 * whole matches, for bill search, where "budget" should find bills rather than a definition.
 */
export function lookup(query: string, limit = 2, exact = false): GlossaryEntry[] {
  const q = normalize(query);
  if (q.length < 3) return [];
  const score = (e: GlossaryEntry) => {
    const names = [e.term, ...(e.aliases ?? [])].map(normalize);
    if (names.some((n) => n === q)) return 3;
    if (q.length >= 4 && names.some((n) => n.startsWith(q))) return 2;
    if (q.length >= 5 && names.some((n) => n.split(' ').some((w) => w.startsWith(q)))) return 1;
    return 0;
  };
  return GLOSSARY.map((e) => ({ e, s: score(e) }))
    .filter((x) => x.s >= (exact ? 3 : 1))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);
}
