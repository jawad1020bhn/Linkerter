"use strict";

/*
 * Labelled evaluation corpus for the hiring classifier.
 *
 * WHAT THIS IS
 * A hand-written set of posts with the verdict each one should get. It exists so a change to
 * the rules can be measured instead of argued about: `node scripts/eval-classifier.cjs`.
 *
 * WHAT THIS IS NOT
 * It is not a representative sample of LinkedIn. The positives were written to cover the
 * shapes that keep failing, so results here are pessimistic and MUST NOT be quoted as
 * real-world precision or recall. Treat the deltas between two runs as the signal, and the
 * absolute numbers as a regression floor.
 *
 * HOW TO EXTEND
 * Add cases where a real detection went wrong. Keep the `note` short and factual; it is what
 * a failure report prints. Never delete a failing case to make the numbers look better.
 */

/** Expected: `open_role` means the post must be reported as a vacancy. */
const POSITIVE = (text, note) => ({ text, note, expected: "open_role" });
/** Expected: the post must NOT be reported as a vacancy (any other category is fine). */
const NEGATIVE = (text, note) => ({ text, note, expected: "not_open_role" });

const corpus = [
  // ── Positives: explicit opening predicates ────────────────────────────────
  POSITIVE("We're hiring a Senior Backend Engineer in Oran. Apply: jobs@acme.com", "en/classic"),
  POSITIVE("Now hiring: warehouse staff, Blida. DM me.", "en/now-hiring"),
  POSITIVE("Hiring: React developer, Oran. Send your CV to jobs@acme.dz", "en/headline"),
  POSITIVE("We have an opening for a staff nurse in Tlemcen.", "en/opening-for"),
  POSITIVE("Join our team as a Junior Accountant in Oran. Apply here.", "en/join-role"),
  POSITIVE("We are hiring engineers and not hiring interns.", "en/conjunction-negation"),
  POSITIVE("Our team is hiring a DevOps engineer. Apply by email.", "en/team-is-hiring"),
  POSITIVE("Position available: receptionist, Algiers. Contact me.", "en/position-available"),

  // ── Positives: French ────────────────────────────────────────────────────
  POSITIVE("Nous recrutons un technicien maintenance à Oran. CV: rh@acme.dz", "fr/recrutons"),
  POSITIVE("🚀 On recrute ! 2 postes de développeur. Postulez ici: https://acme.dz/jobs", "fr/on-recrute"),
  POSITIVE("Poste à pourvoir : Assistant administratif, Oran. Envoyez votre CV.", "fr/poste-a-pourvoir"),
  POSITIVE("Offre d'emploi : chauffeur livreur, Alger. CDI.", "fr/offre-emploi"),
  POSITIVE("Recrutement urgent: 5 agents commerciaux. Postulez dès maintenant.", "fr/urgent"),
  POSITIVE("Nous recrutons des ingénieurs et ne recrutons pas de stagiaires. CV: jobs@x.com", "fr/conjunction-negation"),

  // ── Positives: Arabic, dialect and Arabizi ───────────────────────────────
  POSITIVE("مطلوب مهندس للعمل في وهران. أرسل سيرتك الذاتية إلى jobs@x.com", "ar/classic"),
  POSITIVE("وظيفة شاغرة: محاسب في الجزائر العاصمة. الراتب حسب الخبرة.", "ar/vacancy"),
  POSITIVE("مطلوب موظف استقبال - وهران - دوام كامل - 0555 12 34 56", "ar/phone"),
  POSITIVE("مطلوب مهندس للعمل في وهران ولا نبحث عن متدربين. أرسل سيرتك الذاتية إلى jobs@x.com", "ar/conjunction-negation"),
  POSITIVE("نبحث عن كفاءات في مجال البرمجة للانضمام إلى فريقنا", "ar/kafa2at"),

  // ── Positives: compact ads with no opening predicate ─────────────────────
  // These are the shape the compact pathway exists for. A role title alone must never be
  // enough, so each of these also carries an address, a link or a vacancy word.
  POSITIVE("Full Stack Developer - Alger. contact@acme.dz", "compact/en-title-city-email"),
  POSITIVE("Développeur Full Stack – Alger. contact@acme.dz", "compact/fr-title-city-email"),
  POSITIVE("Sales representative needed. Oran. Send CV to rh@acme.dz", "compact/en-needed"),
  POSITIVE("Junior accountant wanted. Salary negotiable. CV to jobs@firm.com", "compact/en-wanted"),
  POSITIVE("Acme is looking for a Data Analyst. Reach out to me.", "compact/en-employer-seek"),
  POSITIVE("Notre société recherche un comptable. Merci d'envoyer votre CV.", "compact/fr-employer-seek"),
  POSITIVE("Notre agence est à la recherche d'un assistant administratif. CV par mail.", "compact/fr-a-la-recherche"),
  POSITIVE("Position: Senior Software Engineer. Apply by email: jobs@example.com", "compact/en-title-apply"),
  POSITIVE("Urgent: 3 sales agents. CDI. Algiers.", "compact/en-urgent-list"),

  // ── Negatives: job seekers ───────────────────────────────────────────────
  NEGATIVE("I'm open to work. Looking for my next role in data analytics.", "neg/seeker-en"),
  NEGATIVE("Développeur full stack à Alger. Ouvert aux opportunités.", "neg/seeker-fr-city"),
  NEGATIVE("Je suis développeur à Alger et je cherche de nouvelles missions.", "neg/seeker-fr"),
  NEGATIVE("أبحث عن عمل كمهندس في وهران. سيرتي الذاتية في التعليقات.", "neg/seeker-ar"),
  NEGATIVE("مهندس من وهران، أبحث عن عمل. cv@mail.com", "neg/seeker-ar-veto"),
  NEGATIVE("مطور ويب في الجزائر. متاح للعمل.", "neg/seeker-ar-available"),
  NEGATIVE("Comptable à Casablanca, en poste, ouvert à de nouvelles opportunités.", "neg/passive-candidate"),

  // ── Negatives: commentary, news and advice ───────────────────────────────
  NEGATIVE("5 hiring tips: how to interview better.", "neg/advice-en"),
  NEGATIVE("What I learned after 100 interviews.", "neg/advice-en-2"),
  NEGATIVE("Recruteur à Alger: 10 conseils pour réussir vos entretiens.", "neg/advice-fr"),
  NEGATIVE("Les licenciements continuent dans la tech.", "neg/news-fr"),
  NEGATIVE("لماذا يترك الموظفون وظائفهم؟ تحليل جديد لسوق العمل.", "neg/news-ar"),
  NEGATIVE("كيف تكتب سيرة ذاتية ناجحة؟ نصائح عملية.", "neg/advice-ar"),
  NEGATIVE("نصائح لمقابلة العمل الأولى.", "neg/advice-ar-2"),
  NEGATIVE("Ingénieur DevOps à Tunis — je partage mon retour d'expérience sur Kubernetes.", "neg/tech-content"),
  NEGATIVE("Assistante administrative — retour d'expérience après 3 ans à Oran.", "neg/story"),

  // ── Negatives: marketing, courses, events, job boards ────────────────────
  NEGATIVE("Upgrade your workflow today. Try Acme Cloud free.", "neg/marketing-en"),
  NEGATIVE("We help companies hire faster. Book a demo.", "neg/recruiter-marketing"),
  NEGATIVE("Premium features for recruiters. Upgrade now. Contact sales.", "neg/contact-sales"),
  NEGATIVE("Formation en développement web. Inscrivez-vous maintenant.", "neg/course-fr"),
  NEGATIVE("Obtenez votre certification en 3 mois. Places limitées.", "neg/course-fr-2"),
  NEGATIVE("Formation développeur web à Oran. Contactez-nous pour le programme.", "neg/course-role-city"),
  NEGATIVE("Salon de l'emploi à Oran le 12 mai. Entrée libre.", "neg/event"),
  NEGATIVE("Nous organisons un webinaire pour les ingénieurs. Inscription gratuite.", "neg/webinar-role"),
  NEGATIVE("Des milliers d'offres d'emploi sur notre plateforme. Abonnez-vous.", "neg/jobboard"),
  NEGATIVE("Coach carrière pour développeurs à Alger. Réservez un appel.", "neg/coaching-role-city"),

  // ── Negatives: closed, congratulation, unrelated ─────────────────────────
  NEGATIVE("Position filled. Thank you to everyone who applied.", "neg/closed-en"),
  NEGATIVE("Notre bureau d'Alger recrute... euh non, nous avons fermé le poste.", "neg/closed-fr"),
  NEGATIVE("لا توجد وظيفة شاغرة حاليا. تم شغل المنصب.", "neg/closed-ar"),
  NEGATIVE("Félicitations à notre équipe pour ce prix !", "neg/congrats-fr"),
  NEGATIVE("Notre équipe s'agrandit et nous sommes fiers de nos nouveaux bureaux.", "neg/office-news"),
  NEGATIVE("Thrilled to announce that I've joined Acme as Head of Sales!", "neg/new-job"),
  NEGATIVE("Analyste financier à Paris. Publication d'un article sur l'inflation.", "neg/content-role-city"),
  NEGATIVE("Nous cherchons à améliorer nos process, pas à recruter un développeur.", "neg/explicit-non-hiring"),
  NEGATIVE("Des postes de développeurs existent dans notre nouvelle usine. Candidatures en 2027.", "neg/future-openings"),

  // ── Negatives: unsupported languages must not be half-matched ────────────
  NEGATIVE("Estamos contratando un desarrollador backend en Madrid. Envía tu CV a rrhh@empresa.es", "neg/spanish"),
  NEGATIVE("Wir stellen ein: Senior Java Entwickler (m/w/d) in Berlin. Bewerbung an jobs@firma.de", "neg/german"),
  NEGATIVE("Estamos a contratar um programador Python em Lisboa. Envie seu currículo para vagas@empresa.pt", "neg/portuguese"),

  // ── Known misses ─────────────────────────────────────────────────────────
  // These are labelled with what they SHOULD be, and are expected to fail today. They are
  // kept in the corpus rather than deleted so the gap is visible in every run: a rule change
  // that closes one shows up as a recall improvement with no code archaeology.
  //
  //   en/join-role     "Join our team as a Junior Accountant..." scores 4, one point under the
  //                    open_role threshold. A phone number or a link in the same post closes it.
  //   ar/kafa2at       "نبحث عن كفاءات" is recruiter-search vocabulary that in practice always
  //                    advertises a vacancy. Distinguishing it needs a recruiter-vs-employer
  //                    model, not another phrase.
  //   en-urgent-list   "Urgent: 3 sales agents. CDI. Algiers." has no application cue. Route F
  //                    (role + vacancy wording + city) would catch it and nothing else in this
  //                    corpus, but one case is not evidence that the route is safe: course ads
  //                    are the same shape.

  // ── Negatives: sponsored placements are excluded before classification ───
  NEGATIVE("Sponsored: We're hiring a Data Analyst.", "neg/sponsored-labelled")
];

/**
 * Run the corpus through a classifier.
 * @param {{classify: Function}} classifier
 * @param {{sponsored?: boolean}} [options] applied to every case
 */
function evaluate(classifier, options = {}) {
  const rows = corpus.map((entry) => {
    const result = classifier.classify(entry.text, { hrefs: [], sponsored: options.sponsored === true });
    return {
      ...entry,
      category: result.category,
      confidence: result.confidence,
      score: result.score,
      basis: result.scoreBasis || null,
      gotVacancy: result.category === "open_role"
    };
  });

  const positives = rows.filter((row) => row.expected === "open_role");
  const negatives = rows.filter((row) => row.expected !== "open_role");
  const truePositives = positives.filter((row) => row.gotVacancy).length;
  const falsePositives = negatives.filter((row) => row.gotVacancy).length;
  const falseNegatives = positives.length - truePositives;

  return {
    rows,
    totals: {
      cases: rows.length,
      positives: positives.length,
      negatives: negatives.length,
      truePositives,
      falsePositives,
      falseNegatives,
      precision: truePositives + falsePositives === 0
        ? 1
        : truePositives / (truePositives + falsePositives),
      recall: positives.length === 0 ? 1 : truePositives / positives.length
    },
    missed: positives.filter((row) => !row.gotVacancy),
    falsePositives: negatives.filter((row) => row.gotVacancy)
  };
}

module.exports = { corpus, evaluate };
