"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../../linkedin-hiring-rules.js");
require("../../linkedin-hiring-classifier.js");
const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;

const category = (text, hrefs = []) => classifier.classify(text, { hrefs }).category;

test("opening-shaped phrases about programmes, events, volunteering, and praise are not active openings", () => {
  // A single ambiguous intake phrase must not reach the top category on its own.
  assert.notEqual(category("Applications are open for the Spring 2027 MBA intake at our business school."), "open_role");
  assert.notEqual(category("Applications are open for our free webinar on negotiation skills."), "open_role");
  assert.notEqual(category("Applications now open for the national startup grant programme."), "open_role");
  assert.notEqual(category("Join our team of volunteers for the beach cleanup this Saturday!"), "open_role");
  assert.notEqual(category("Our team is growing fast and I could not be prouder of what we shipped this year."), "open_role");
  assert.notEqual(category("Come work with us — literally, our office coffee bar is now legendary."), "open_role");
  assert.notEqual(category("Candidatures ouvertes pour le concours d'entrée à l'école d'ingénieurs."), "open_role");
  // They stay visible for review rather than disappearing.
  assert.equal(category("Applications are open for our free webinar on negotiation skills."), "possible");
});

test("an ambiguous intake phrase with independent employment context is still an opening", () => {
  assert.equal(category("Applications are open for the Customer Success role. Apply by Friday."), "open_role");
  assert.equal(category("Join our team — open position for a warehouse supervisor, full time."), "open_role");
  assert.equal(category("Applications are open for our new remote position https://acme.com/careers", ["https://acme.com/careers"]), "open_role");
  // The corroboration must be independent of the matched phrase itself.
  assert.notEqual(category("فرصة عمل"), "open_role");
});

test("unambiguous hiring predicates keep their single-phrase open_role contract", () => {
  assert.equal(category("We are hiring!"), "open_role");
  assert.equal(category("Nous recrutons un développeur."), "open_role");
  assert.equal(category("نحن نوظف"), "open_role");
  assert.equal(category("Now hiring: warehouse supervisors, full time."), "open_role");
});

test("common title-line and first-person vacancy frames are detected in EN, FR, and AR", () => {
  assert.equal(category("Hiring: Site Reliability Engineer, hybrid, Lisbon. Apply here."), "open_role");
  assert.equal(category("Hiring - Regional Sales Manager (CDI), Lyon"), "open_role");
  assert.equal(category("Je recrute un développeur full-stack pour notre bureau d'Oran."), "open_role");
  assert.equal(category("Nous sommes à la recherche d'un chef de projet IT en CDI à Paris."), "open_role");
  assert.equal(category("مطلوب مهندس مدني للعمل في مشروع بالجزائر"), "open_role");
  assert.equal(category("مطلوب محاسب في شركة بالجزائر العاصمة"), "open_role");
});

test("vacancy frames do not capture job-seeker or advice text", () => {
  assert.equal(category("Je suis à la recherche d'un emploi dans la logistique."), "job_seeker");
  assert.equal(category("أبحث عن عمل في مجال التسويق الرقمي"), "job_seeker");
  // A "Hiring:" headline about advice stays advice, not a vacancy.
  assert.equal(category("Hiring: what I learned after interviewing 200 engineers"), "hiring_discussion");
  assert.equal(category("5 things I look for when hiring engineers"), "hiring_discussion");
  assert.equal(category("I am not hiring, but here are hiring tips for new engineering managers."), "hiring_discussion");
});

test("negation scope stops at clause connectives instead of counting words", () => {
  const advice = classifier.classify("I am not hiring, but here are hiring tips for new engineering managers.");
  assert.equal(advice.category, "hiring_discussion");
  assert.equal(advice.signals.adviceNews, true, "the advice cue must survive the negation in the previous clause");

  // A denial in one clause must no longer swallow the affirmation in the next.
  const arabic = classifier.classify("لا نوظف حاليا لكن التقديم مفتوح لمنصب آخر");
  assert.notEqual(arabic.category, "closed");
  assert.equal(arabic.signals.ambiguousOpening, true);

  const laterClause = classifier.classify("No open roles here, but our partner has open roles in Paris.");
  assert.equal(laterClause.category, "open_role");

  const however = classifier.classify("We are not hiring, however we have an opening starting next month.");
  assert.equal(however.category, "open_role");

  const stillClosed = classifier.classify("We are not hiring at the moment and we are no longer accepting applications.");
  assert.equal(stillClosed.category, "closed");

  const sameClause = classifier.classify("We are not hiring engineers this quarter.");
  assert.equal(sameClause.category, "closed");
});

test("every suppressed signal group is reported in evidence so 'none' stays explainable", () => {
  const negatedAdvice = classifier.classify("We are not hiring and we publish no hiring tips either.");
  assert.ok(
    negatedAdvice.evidence.some((entry) => /^Negated /.test(entry)),
    `expected a negation evidence entry, got ${JSON.stringify(negatedAdvice.evidence)}`
  );

  const negatedSeeker = classifier.classify("I am not open to work and not looking for a job.");
  assert.equal(negatedSeeker.category, "none");
  assert.ok(
    negatedSeeker.evidence.some((entry) => /^Negated /.test(entry)),
    `expected a negation evidence entry, got ${JSON.stringify(negatedSeeker.evidence)}`
  );
});
