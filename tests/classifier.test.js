"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

require("../core/sha256.js");
require("../core/linkedin-hiring-rules.js");
require("../core/linkedin-hiring-classifier.js");

// Rules and classifier publish themselves on globalThis (they have no CommonJS export),
// because the browser loads them as plain content scripts.
const rules = globalThis.__LI_FEED_HIRING_RULES__;
const classifier = globalThis.__LI_FEED_HIRING_CLASSIFIER__;

const classify = (text, options) => classifier.classify(text, options);

test("rule tables carry a reproducible provenance hash", () => {
  assert.match(rules.tablesHash, /^sha256:[0-9a-f]{64}$/);
  assert.match(classifier.classifierHash, /^sha256:[0-9a-f]{64}$/);
});

test("normalizeText folds diacritics, Arabic variants and typographic punctuation", () => {
  assert.equal(classifier.normalizeText("  Nous   RECRUTONS ! "), "nous recrutons !");
  assert.equal(classifier.normalizeText("Élodie"), "elodie");
  assert.equal(classifier.normalizeText("أحمد"), "احمد");
  assert.equal(classifier.normalizeText("وظيفـة"), "وظيفة");
  assert.equal(classifier.normalizeText("we’re hiring"), "we re hiring");
});

test("English hiring post with a role and a contact address is a strong opening", () => {
  const result = classify("We're hiring a Senior Backend Engineer. Apply: jobs@acme.com");
  assert.equal(result.category, "open_role");
  assert.equal(result.confidence, "strong");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.email, "full");
  assert.ok(result.evidence.some((line) => line.startsWith("Hiring phrase")));
});

test("a hiring hashtag pushes a clean opening to strong confidence", () => {
  const result = classify("We're hiring a Senior Backend Engineer. #hiring jobs@acme.com");
  assert.equal(result.category, "open_role");
  assert.equal(result.confidence, "strong");
  assert.equal(result.signals.hashtag, true);
});

test("French hiring post is an opening", () => {
  const result = classify("Nous recrutons un développeur full-stack à Lyon. Envoyez votre CV à rh@exemple.fr");
  assert.equal(result.category, "open_role");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.email, "full");
});

test("Arabic hiring post is an opening", () => {
  const result = classify("مطلوب موظف للعمل في الرياض. أرسل سيرتك الذاتية");
  assert.equal(result.category, "open_role");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.regionalGulf, true);
});

test("a closed post is reported as closed, not as a vacancy", () => {
  const result = classify("We are not hiring for this role. Position filled.");
  assert.equal(result.category, "closed");
  assert.equal(result.signals.closed, true);
  assert.equal(result.signals.activeOpening, false);
});

test("negation only suppresses its own clause", () => {
  const result = classify("We are not hiring interns. However, we are hiring a Senior Engineer.");
  assert.equal(result.category, "open_role");
  assert.equal(result.signals.activeOpening, true);
});

// A conjunction ends the negation's scope without ending the sentence: the advertised role
// in the first clause must survive the withdrawn role in the second. Earlier behaviour
// reported `closed / 0` here, silently dropping a real opening.
test("a conjunction ends negation scope but keeps the advertised role", () => {
  for (const text of [
    "We are hiring engineers and not hiring interns.",
    "We are hiring engineers and are not hiring interns.",
    "We're hiring a backend developer and we don't hire interns. CV: jobs@x.com",
    "Nous recrutons des ingénieurs et ne recrutons pas de stagiaires. CV: jobs@x.com",
    "مطلوب مهندس للعمل في وهران ولا نبحث عن متدربين. أرسل سيرتك الذاتية إلى jobs@x.com"
  ]) {
    const result = classify(text);
    assert.equal(result.category, "open_role", text);
    assert.equal(result.signals.activeOpening, true, text);
  }
});

test("a conjunction does not turn a fully withdrawn post into an opening", () => {
  const result = classify("We are not hiring engineers and not hiring interns. Position filled.");
  assert.equal(result.category, "closed");
  assert.equal(result.signals.activeOpening, false);
});

test("Arabic closed phrasings are recognized in both numbers", () => {
  for (const text of ["لا توجد وظيفة شاغرة", "لا توجد وظائف شاغرة", "لا شاغر حاليا"]) {
    const result = classify(text);
    assert.equal(result.category, "closed", text);
    assert.equal(result.signals.closed, true, text);
  }
});

test("a conjunction inside a role name does not split a genuine negation", () => {
  const result = classify("We are not hiring for research and development roles. The position has been filled.");
  assert.equal(result.category, "closed");
  assert.equal(result.signals.activeOpening, false);
});

test("a first-person job seeker post is not an opening", () => {
  const result = classify("I'm open to work. Looking for my next role in data analytics.");
  assert.equal(result.category, "job_seeker");
  assert.equal(result.signals.jobSeeker, true);
  assert.equal(result.signals.activeOpening, false);
});

test("a recruiter search is separated from an opening", () => {
  const result = classify("Recruiter looking for candidates for a fintech role. Reach out to me.");
  assert.equal(result.category, "recruiter_search");
  assert.equal(result.signals.recruiterSearch, true);
});

test("hiring commentary is advice, not a vacancy", () => {
  const result = classify("5 hiring tips: how to interview better.");
  assert.equal(result.category, "hiring_discussion");
  assert.equal(result.signals.adviceNews, true);
  assert.equal(result.signals.activeOpening, false);
});

test("a sponsored placement that names no vacancy is not detected", () => {
  const result = classify("Upgrade your workflow today.", { sponsored: true });
  assert.equal(result.category, "none");
  assert.equal(result.score, 0);
});

test("email detection separates full addresses from @domain fragments", () => {
  assert.equal(classifier.detectEmail("write to jane.doe@example.com").kind, "full");
  assert.equal(classifier.detectEmail("apply @acme.com").kind, "partial");
  assert.equal(classifier.detectEmail("no contact details").kind, "none");
  assert.deepEqual(classifier.extractEmails("a@x.com and b@y.org and a@x.com"), ["a@x.com", "b@y.org"]);
});

test("job links are recognized from hrefs", () => {
  const result = classify("We're hiring a designer.", { hrefs: ["https://boards.greenhouse.io/acme/jobs/1"] });
  assert.equal(result.signals.jobLink, true);
  assert.equal(result.category, "open_role");
});

test("an empty post has no signal and no evidence", () => {
  const result = classify("");
  assert.equal(result.category, "none");
  assert.equal(result.confidence, "none");
  assert.equal(result.score, 0);
  assert.deepEqual(result.evidence, []);
  assert.equal(result.scoreMax, null);
});

// ── Language scope: English, French, Arabic only ──────────────────
// The rule tables carry exactly three languages. A Spanish, German or Portuguese post must
// not be half-recognised through a stray shared token ("jobs", "job"), so the contract is
// asserted from the other side: the vocabulary is gone and the post does not become an
// opening.

test("the rule tables declare English, French and Arabic only", () => {
  assert.deepEqual(rules.supportedLanguages, ["en", "fr", "ar"]);
});

test("unsupported-language hiring posts are not openings", () => {
  for (const text of [
    "Estamos contratando un desarrollador backend en Madrid. Envía tu CV a rrhh@empresa.es",
    "Buscamos comercial para nuestra delegación de Sevilla.",
    "Se busca camarero para restaurante en Valencia, jornada completa.",
    "Wir stellen ein: Senior Java Entwickler (m/w/d) in Berlin. Bewerbung an jobs@firma.de",
    "Gesucht: Pflegefachkraft (m/w/d) in Hamburg",
    "Wir suchen Verstärkung für unser Team in München. Jetzt bewerben!",
    "Estamos a contratar um programador Python em Lisboa. Envie seu currículo para vagas@empresa.pt",
    "Vaga para designer gráfico no Porto.",
    "Procura-se empregado de mesa para restaurante no centro."
  ]) {
    assert.notEqual(classify(text).category, "open_role", text);
  }
});

test("unsupported-language seeker, closed and advice posts are not classified", () => {
  assert.notEqual(classify("Estoy en búsqueda activa de empleo como analista de datos.").category, "job_seeker");
  assert.notEqual(classify("Ich suche eine neue Stelle als Data Engineer.").category, "job_seeker");
  assert.notEqual(classify("Estou em busca de uma nova oportunidade como product manager.").category, "job_seeker");
  for (const text of [
    "Ya no estamos contratando para este puesto. Vacante cubierta.",
    "Keine offenen Stellen mehr, die Position ist besetzt.",
    "Não há vagas no momento, a vaga foi preenchida."
  ]) {
    assert.equal(classify(text).category, "none", text);
    assert.equal(classify(text).signals.closed, false, text);
  }
  assert.notEqual(classify("5 consejos de contratación: cómo entrevistar mejor.").category, "hiring_discussion");
  assert.notEqual(classify("Tipps zur Einstellung: So führst du bessere Interviews.").category, "hiring_discussion");
});

test("unsupported-language job boards and hashtags are not recognised", () => {
  // The board hosts are gone from jobLinkPatterns. The generic "/jobs/" path in the
  // stepstone URL still matches — that pattern is language-neutral and shared with the
  // English boards — so the assertion is that the localized host alone proves nothing.
  for (const [text, href, stillGeneric] of [
    ["Buscamos comercial", "https://www.infojobs.net/oferta/1", false],
    ["Wir stellen ein: Backend Engineer", "https://www.stepstone.de/jobs/1", true],
    ["Vaga para designer", "https://www.catho.com.br/vagas/1", false]
  ]) {
    const result = classify(text, { hrefs: [href] });
    assert.equal(result.signals.jobLink, stillGeneric, href);
    assert.notEqual(result.category, "open_role", href);
  }
  for (const text of ["Estamos contratando #empleo", "Wir stellen ein #stellenangebot", "Contratamos #vagas"]) {
    const result = classify(text);
    assert.equal(result.signals.hashtag, false, text);
    assert.notEqual(result.category, "open_role", text);
  }
});

// ── Sponsored placements are never candidates ────────────────────
// A promoted placement is advertising inventory. It is excluded in the extractor before
// classification, and this guard covers direct callers that pass a flag or labelled text.

test("a sponsored placement is rejected even when it advertises a vacancy", () => {
  const result = classify("Sponsored: We're hiring a Data Analyst.", { sponsored: true });
  assert.equal(result.category, "none");
  assert.equal(result.confidence, "none");
  assert.equal(result.score, 0);
  assert.equal(result.sponsored, true);
  assert.equal(result.signals.sponsored, true);
  assert.equal(result.signals.activeOpening, false);
});

test("a sponsored flag alone rejects a plain vacancy without a sponsored label", () => {
  const result = classify("We're hiring a backend engineer. Apply by email: jobs@acme.com", { sponsored: true });
  assert.equal(result.category, "none");
  assert.equal(result.score, 0);
});

test("the sponsored guard also catches the label in the post text", () => {
  for (const text of [
    "We're hiring a backend engineer. Promoted post.",
    "منشور ممول: مطلوب مهندس للعمل في وهران. أرسل سيرتك الذاتية.",
    "Nous recrutons un ingénieur. Publication sponsorisée."
  ]) {
    const result = classify(text);
    assert.equal(result.category, "none", text);
    assert.equal(result.sponsored, true, text);
  }
});

