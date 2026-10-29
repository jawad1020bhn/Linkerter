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

test("a sponsored placement that names a vacancy keeps its classification", () => {
  const result = classify("Sponsored: We're hiring a Data Analyst.", { sponsored: true });
  assert.equal(result.category, "open_role");
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

// ── Spanish, German and Portuguese ────────────────────────────────
// The classifier ships rule tables for Spanish, German and Portuguese posts, so the
// same evidence that promotes an English or French post has to promote these too.

test("Spanish hiring post with a contact address is a strong opening", () => {
  const result = classify("Estamos contratando un desarrollador backend en Madrid. Envía tu CV a rrhh@empresa.es");
  assert.equal(result.category, "open_role");
  assert.equal(result.confidence, "strong");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.email, "full");
  assert.equal(result.signals.contactCues, true);
});

test("Spanish article-less headlines still count as openings", () => {
  for (const text of [
    "Buscamos comercial para nuestra delegación de Sevilla.",
    "Se busca camarero para restaurante en Valencia, jornada completa.",
    "Se necesita dependiente/a con experiencia en tienda."
  ]) {
    assert.equal(classify(text).category, "open_role", text);
  }
});

test("Spanish marketing copy that uses the same verbs is not an opening", () => {
  for (const text of [
    "Buscamos la excelencia en cada proyecto.",
    "Buscamos mejorar la experiencia de nuestros clientes."
  ]) {
    assert.notEqual(classify(text).category, "open_role", text);
  }
});

test("Spanish job seeker, recruiter search and closed posts are separated", () => {
  assert.equal(classify("Estoy en búsqueda activa de empleo como analista de datos.").category, "job_seeker");
  assert.equal(classify("Busco trabajo en marketing digital, tengo cinco años de experiencia.").category, "job_seeker");
  assert.equal(classify("Reclutador buscando candidatos para puesto en fintech.").category, "recruiter_search");
  const closed = classify("Ya no estamos contratando para este puesto. Vacante cubierta.");
  assert.equal(closed.category, "closed");
  assert.equal(closed.signals.closed, true);
  assert.equal(closed.signals.activeOpening, false);
});

test("Spanish hiring advice stays commentary", () => {
  const result = classify("5 consejos de contratación: cómo entrevistar mejor.");
  assert.equal(result.category, "hiring_discussion");
  assert.equal(result.signals.adviceNews, true);
  assert.equal(result.signals.activeOpening, false);
});

test("German hiring post with (m/w/d) is an opening", () => {
  const result = classify("Wir stellen ein: Senior Java Entwickler (m/w/d) in Berlin. Bewerbung an jobs@firma.de");
  assert.equal(result.category, "open_role");
  assert.equal(result.confidence, "strong");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.roleMarker, true);
  assert.equal(result.signals.email, "full");
});

test("German headline and call-to-action forms are openings", () => {
  assert.equal(classify("Gesucht: Pflegefachkraft (m/w/d) in Hamburg").category, "open_role");
  assert.equal(classify("Wir suchen Verstärkung für unser Team in München. Jetzt bewerben!").category, "open_role");
  assert.equal(classify("Freie Stelle: Pflegefachkraft in Hamburg.").category, "open_role");
});

test("German job seeker and closed posts are separated", () => {
  assert.equal(classify("Ich suche eine neue Stelle als Data Engineer. Offen für neue Möglichkeiten.").category, "job_seeker");
  const closed = classify("Keine offenen Stellen mehr, die Position ist besetzt.");
  assert.equal(closed.category, "closed");
  assert.equal(closed.signals.closed, true);
});

test("German hiring advice stays commentary", () => {
  const result = classify("Tipps zur Einstellung: So führst du bessere Interviews.");
  assert.equal(result.category, "hiring_discussion");
  assert.equal(result.signals.adviceNews, true);
});

test("Portuguese hiring post with a contact address is a strong opening", () => {
  const result = classify("Estamos a contratar um programador Python em Lisboa. Envie seu currículo para vagas@empresa.pt");
  assert.equal(result.category, "open_role");
  assert.equal(result.confidence, "strong");
  assert.equal(result.signals.activeOpening, true);
  assert.equal(result.signals.email, "full");
  assert.equal(result.signals.applicationCta, true);
  assert.equal(result.signals.contactCues, true);
});

test("Portuguese headline forms are openings", () => {
  assert.equal(classify("Vaga para designer gráfico no Porto.").category, "open_role");
  assert.equal(classify("Procura-se empregado de mesa para restaurante no centro.").category, "open_role");
  assert.equal(classify("Procuramos um/uma designer gráfico para a nossa equipa.").category, "open_role");
});

test("Portuguese job seeker and closed posts are separated", () => {
  assert.equal(classify("Estou em busca de uma nova oportunidade como product manager.").category, "job_seeker");
  const closed = classify("Não há vagas no momento, a vaga foi preenchida.");
  assert.equal(closed.category, "closed");
  assert.equal(closed.signals.closed, true);
});

test("Portuguese hiring advice stays commentary", () => {
  const result = classify("Dicas de contratação: como fazer entrevistas melhores.");
  assert.equal(result.category, "hiring_discussion");
  assert.equal(result.signals.adviceNews, true);
});

test("Spanish, German and Portuguese job boards and hashtags are recognized", () => {
  for (const [text, href] of [
    ["Buscamos comercial", "https://www.infojobs.net/oferta/1"],
    ["Wir stellen ein: Backend Engineer", "https://www.stepstone.de/jobs/1"],
    ["Vaga para designer", "https://www.catho.com.br/vagas/1"]
  ]) {
    const result = classify(text, { hrefs: [href] });
    assert.equal(result.signals.jobLink, true, href);
    assert.equal(result.category, "open_role", href);
  }
  for (const [text, expected] of [
    ["Estamos contratando #empleo", "empleo"],
    ["Wir stellen ein #stellenangebot", "stellenangebot"],
    ["Contratamos #vagas", "vagas"]
  ]) {
    const result = classify(text);
    assert.equal(result.signals.hashtag, true, expected);
    assert.equal(result.category, "open_role", expected);
  }
});

