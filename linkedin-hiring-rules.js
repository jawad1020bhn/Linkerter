(() => {
  "use strict";

  // Keyword groups intentionally exclude job-title families. They are signals,
  // not a guarantee that a post contains an active vacancy.
  //
  // `activeOpening` holds unambiguous hiring predicates: a single hit is enough to
  // call a post an opening. `ambiguousOpening` holds opening-shaped phrases that
  // programmes, events, grants, volunteering, and employer praise also use, so they
  // only reach `open_role` together with independent employment context and
  // otherwise stay in the `possible` review bucket.
  globalThis.__LI_FEED_HIRING_RULES__ = {
    activeOpening: [
      // English
      "we're hiring", "we are hiring", "we're actively hiring", "we are actively hiring",
      "now hiring", "hiring now", "actively hiring", "currently hiring", "our team is hiring",
      "we're recruiting", "we are recruiting", "currently recruiting", "we're looking to hire",
      "we are looking to hire", "we have an opening", "we have openings", "open role", "open roles",
      "open position", "open positions", "job opening", "job openings", "position available",
      "positions available", "role available", "roles available",
      "hiring for", "vacancy available",
      // French
      "nous recrutons", "on recrute", "nous embauchons", "on embauche", "recrutement en cours",
      "nous recherchons des candidats", "nous recherchons", "on recherche", "poste à pourvoir",
      "postes à pourvoir", "poste vacant", "postes vacants", "offre d'emploi",
      "recrutement immédiat", "opportunité d'emploi", "poste est fait pour vous", "ce poste est fait pour vous",
      "plusieurs postes ouverts", "poste ouvert", "postes ouverts",
      "je recrute", "nous sommes à la recherche", "recrutement urgent", "profil recherché", "profils recherchés",
      "nous cherchons des candidats", "nous avons des postes", "poste à combler", "postes à combler",
      // Arabic
      "نحن نوظف", "نحن بصدد التوظيف", "نقوم بالتوظيف", "إعلان توظيف", "نبحث عن موظف",
      "نبحث عن موظفين", "مطلوب للعمل", "مطلوب موظف",
      "مطلوب موظفين", "مطلوبة للعمل", "وظيفة شاغرة", "وظائف شاغرة",
      "منصب شاغر", "مناصب شاغرة", "نستقبل طلبات التوظيف", "التوظيف مستمر", "توظيف فوري",
      "المنصب المطلوب", "المطلوب للعمل",
      "توظيف عاجل", "نحتاج إلى موظف", "نحتاج إلى موظفين", "أرسل سيرتك الذاتية", "أرسلوا السيرة الذاتية",
      "للتقديم يرجى", "للتقديم أرسل",
    ],

    // Opening-shaped intake phrasing shared with programme, event, grant, volunteering,
    // and employer-praise posts. These need independent employment context before they
    // may be reported as an active opening.
    ambiguousOpening: [
      // English
      "join our team", "come work with us", "our team is growing", "applications are open",
      "applications now open", "referrals welcome", "we're expanding our team", "we are expanding our team",
      // French
      "rejoignez notre équipe", "rejoignez-nous", "intégrer notre équipe", "notre équipe s'agrandit",
      "candidatures ouvertes", "nous acceptons les candidatures", "offres d'emploi", "nos offres d'emploi",
      "découvrez nos offres", "venez découvrir nos offres",
      // Arabic
      "انضم إلى فريقنا", "انضمي إلى فريقنا", "انضموا إلى فريقنا", "التقديم مفتوح", "باب التقديم مفتوح",
      "فرصة عمل", "فرص عمل", "فرصة تدريب", "تدريب متاح"
    ],

    // Grammatical vacancy frames rather than occupational title families. Each frame is a
    // regex source applied to normalized text and must stay language-structural: it describes
    // how a vacancy sentence is built, never which job titles exist.
    openingFrames: [
      // "Hiring: <title>" / "Hiring - <title>" as a post headline.
      "(?:^|\\.\\s)hiring\\s*[:\\-]\\s*\\S",
      // "مطلوب <one to three words> للعمل|للانضمام|في …" — the common Arabic vacancy frame.
      "مطلوب(?:\\s+\\S+){1,3}\\s+(?:للعمل|للانضمام|في)",
      // French third-person hiring predicate taking a complement: "<entreprise> recrute !",
      // "recrute pour son site", "recrute un(e) …", "recrutent 04 …". Deliberately not the
      // noun "recrutement", which commentary posts also use.
      "(?<!\\p{L})recrut(?:e|ent)(?!\\p{L})(?:\\s*[!:|]\\s*|\\s+(?:un|une|des|du|pour|son|sa|ses|nos|notre|votre|vos|leur|leurs|ce|cette|cet|\\d))",
      // Employer-side first person looking for a person, as opposed to a job seeker looking
      // for a job: "je recherche la personne / un profil / un candidat".
      "je\\s+(?:recherche|cherche)\\s+(?:la|le|un|une|du|des)\\s+(?:personne|profil|candidat|candidate|talent|collaborateur|collaboratrice|alternant|stagiaire|remplacement)\\b",
      // "<company> recherche son/sa <role>" and "we are looking for a/an <role>".
      "(?:recherche|recherchons)\\s+(?:son|sa|notre|nos)\\s+(?:\\p{L}+)\\b",
      "we\\s+(?:are|'re)?\\s*(?:looking|hiring)\\s+for\\s+(?:a|an|the|\\d)\\b",
      // Arabic hiring headlines: "توظيف | …", "توظيف فوري", "المنصب المطلوب: …".
      "(?:^|[\\s|:])توظيف(?:\\s*[|:!\\-]\\s*|\\s+(?:فوري|عاجل|مباشر|حاليا|في))",
      "المنصب\\s+المطلوب\\s*(?:[:|]|$)"
    ],

    // Evidence that a specific role is described, not merely that openings exist somewhere.
    // Intake phrasing ("join our team", "browse our offers") may only be promoted to an
    // active opening when one of these structural markers is present. No occupational
    // title families: these are section headers and ad conventions.
    roleMarkers: [
      "(h/f)", "h/f", "f/h", "(m/f)", "m/f",
      "poste suivant", "postes suivants", "nombre de postes", "pour le poste de", "pour un poste de",
      "au poste de", "vos missions", "missions principales", "profil requis", "profil recherché",
      "profils recherchés", "qualifications requises", "expérience professionnelle", "lieu de travail",
      "type de contrat", "prise de fonction", "candidature : ", "objet du mail",
      "key responsibilities", "responsibilities:", "requirements:", "qualifications:", "job description",
      "as our new", "join our team as", "join the team as", "rejoignez notre équipe en tant que",
      "rejoignez l'équipe en tant que", "work location", "employment type",
      "الشروط", "المؤهلات", "المنصب المطلوب", "مهام الوظيفة", "خبرة مهنية", "مكان العمل", "طبيعة العقد"
    ],

    // Intake phrasing whose grammatical object is a role or position, as opposed to a
    // programme, grant, exam, or event. Structural only: no occupational title families.
    roleMarkerFrames: [
      "(?:applications?|candidatures?)\\s+(?:are|is|now|sont|est)?\\s*(?:open|ouvertes?)\\s+(?:for|pour|to)\\s+(?:the|a|an|our|le|la|les|un|une|notre|nos)\\s+[\\p{L}\\s'\'-]{0,40}?\\b(?:role|position|job|poste|emploi|fonction)\\b",
      "(?:we|on|nous)\\s+(?:are\\s+)?(?:hiring|recruiting|recrute|recrutons)\\s+(?:for\\s+)?(?:a|an|the|un|une|le|la|des|du)\\s+[\\p{L}\\s'\'-]{0,40}?\\b(?:role|position|job|poste|emploi)\\b"
    ],

    // Sponsored and promoted placements are advertising, not posts. A promoted post that
    // still names a vacancy keeps its normal classification; platform and brand advertising
    // that names none must never enter the opening buckets.
    sponsoredMarkers: [
      "post sponsorisé", "publication sponsorisée", "annonce sponsorisée", "sponsorisé",
      "sponsored post", "sponsored", "promoted post", "promoted",
      "منشور ممول", "إعلان ممول", "ممول"
    ],

    // First-person job-seeker frames. The subject and the object both matter: a seeker looks
    // for a *job*, an employer looks for a *person*. Without this split "je recherche …" is
    // ambiguous and real seeker posts fall into `possible`.
    jobSeekerFrames: [
      "je\\s+(?:recherche|cherche)\\s+(?:un|une|le|la|mon|ma|du|des|nouveau|nouvelle)\\s*(?:\\p{L}+\\s+){0,2}?(?:poste|emploi|travail|job|opportunité|alternance|stage|mission|contrat)\\b",
      "(?:je\\s+suis|je\\s+me\\s+tiens)\\s+(?:actuellement\\s+)?(?:à\\s+l'écoute|à\\s+la\\s+recherche|en\\s+recherche|disponible)\\b",
      "à\\s+(?:la\\s+recherche|l'écoute)\\s+(?:de|d'|du)\\s*(?:nouvelles?\\s+)?(?:opportunités?|postes?|emplois?|offres?|marché)\\b",
      "je\\s+souhaite\\s+intégrer\\s+(?:une|votre|une\\s+nouvelle)\\s+entreprise\\b",
      "disponible\\s+pour\\s+(?:étudier\\s+)?toute\\s+opportunité",
      "i\\s+(?:am|'m)\\s+(?:currently\\s+)?(?:looking|searching|on\\s+the\\s+look)\\s+(?:for|out)\\s+(?:for\\s+)?(?:a|an|my|the|new)\\b[^.!?]{0,40}(?:job|role|position|opportunity|opportunities|work|challenge)",
      "i\\s+(?:am|'m)\\s+open\\s+to\\s+(?:new\\s+)?(?:opportunities|roles|offers|work|relocation)\\b",
      "open\\s+to\\s+work\\b",
      "recently\\s+(?:made\\s+redundant|laid\\s+off)\\b",
      "looking\\s+for\\s+my\\s+next\\s+(?:role|job|position|opportunity)\\b",
      "(?:أبحث|ابحث)\\s+عن\\s+(?:عمل|وظيفة|فرصة|منصب|تدريب|شغل)\\b",
      "(?:باحث|باحثة)\\s+عن\\s+(?:عمل|وظيفة|فرصة)\\b",
      "(?:مهتم|مهتمت)\\s+(?:بالفرص|بايجاد|بإيجاد|بعمل)\\b",
      "على\\s+استعداد\\s+(?:للعمل|للانضمام)\\b"
    ],

    // Clause connectives that end a negation's scope. Without them a negation in one clause
    // suppresses a genuine signal in the next ("we are not hiring, but …").
    negationConnectives: [
      "but", "however", "though", "although", "yet", "whereas",
      "mais", "cependant", "toutefois", "par contre", "pourtant",
      "لكن", "ولكن", "بل", "الا ان", "غير ان"
    ],

    // Optional Algerian dialect / Arabizi spellings are deliberately weak and noisy signals.
    weakRegional: [
      "رانا نبحثو على", "رانا نقلبو على", "نقلبو على موظف", "نحتاجو موظف", "لي مهتم يبعث",
      "اللي مهتم يبعث", "ابعثلي السيرة الذاتية", "كاين منصب", "كاين مناصب", "recrutement à alger",
      "recrutement à oran", "rana nlawjo 3la", "rana nqelbo 3la", "rani nlawj 3la",
      "kayen poste", "kayn poste", "li yhemmo yb3ath", "sift cv", "siftili cv", "n7tajou"
    ],

    recruiterSearch: [
      "recruiting for", "recruiter looking for", "recruiter seeking", "looking for candidates",
      "seeking candidates", "searching for candidates", "we need candidates", "sourcing candidates",
      "candidate search", "talent search", "reach out to candidates", "referrals for this role",
      "recherchons des candidats", "recherche de candidats", "recherche candidats", "recherche de profils",
      "nous recherchons des profils", "candidats recherchés", "profils recherchés", "sourcing de candidats",
      "نبحث عن مرشحين", "نبحث عن مترشحين", "نبحث عن كفاءات", "نبحث عن مواهب", "مطلوب مرشح",
      "مطلوب مرشحين", "استقطاب مرشحين", "استقطاب المواهب"
    ],

    recruiterTerms: [
      "recruiter", "recruiters", "recruitment", "recruiting", "talent acquisition", "talent partner",
      "talent sourcer", "sourcer", "headhunter", "executive search", "staffing agency", "hiring manager",
      "people team", "human resources", "hr business partner", "people operations",
      "recruteur", "recruteuse", "recrutement", "chargé de recrutement", "chargée de recrutement",
      "responsable recrutement", "consultant en recrutement", "cabinet de recrutement", "chasseur de têtes",
      "acquisition de talents", "ressources humaines", "responsable rh", "استقطاب المواهب",
      "مسؤول توظيف", "مسؤولة توظيف", "أخصائي توظيف", "أخصائية توظيف", "موارد بشرية",
      "الموارد البشرية", "إدارة الموارد البشرية", "شركة توظيف", "مكتب توظيف", "وكالة توظيف"
    ],

    genericJobTerms: [
      // Generic employment vocabulary only; no occupation/title list.
      "job", "jobs", "employment", "career opportunity", "career opportunities", "vacancy", "vacancies",
      "opening", "openings", "position", "positions", "role", "roles", "job description", "job posting",
      "application link", "careers page",
      "emploi", "emplois", "poste", "postes",
      "opportunité d'emploi", "opportunités d'emploi", "opportunité professionnelle", "opportunités professionnelles",
      "وظيفة", "وظائف", "عمل", "أعمال", "فرصة مهنية",
      "منصب", "مناصب", "شاغر", "شواغر", "طلب توظيف", "استمارة التقديم", "رابط التقديم", "وصف الوظيفة",
      "حديث التخرج"
    ],

    // Contract and working-arrangement vocabulary. Reported as context and evidence, but it
    // never creates employment context, term variety, or a `possible` verdict on its own:
    // freelance/CDI/remote wording appears in career stories and agency marketing too.
    contractTerms: [
      "full time", "part time", "permanent position", "contract role", "temporary role",
      "freelance role", "remote position", "hybrid position", "internship", "internships",
      "graduate role", "apprenticeship", "cdi", "cdd", "intérim", "temps plein", "temps partiel",
      "freelance", "stage", "alternance", "apprentissage", "télétravail", "emploi à distance",
      "fonction", "mission", "contrat",
      "دوام كامل", "دوام جزئي", "عقد دائم", "عقد محدد المدة", "عمل مؤقت", "عمل حر", "تدريب", "متدرب",
      "تدريب مهني", "عمل عن بعد", "دوام هجين"
    ],

    applicationCta: [
      "apply now", "apply here", "apply today", "please apply", "how to apply", "submit your application",
      "send your resume", "send your cv", "email your cv", "send me your cv", "dm me your cv",
      "share your resume", "applications close", "apply by", "application deadline", "application link",
      "postulez", "postulez ici", "postulez dès maintenant", "comment postuler", "envoyez votre cv",
      "envoyez-moi votre cv", "transmettez votre cv", "envoyez votre candidature", "déposez votre candidature",
      "candidature à envoyer", "merci d'envoyer votre cv", "cv et lettre de motivation", "lien de candidature",
      "pour candidater", "par ici pour candidater", "candidater dès maintenant", "pour postuler",
      "قدّم طلبك", "قدم طلبك", "للتقديم", "للتقديم يرجى", "أرسل سيرتك الذاتية", "أرسلوا السيرة الذاتية",
      "أرسل سيرتك", "يرجى إرسال السيرة الذاتية", "رابط التقديم", "التقديم عبر الرابط", "املأ استمارة التقديم"
    ],

    jobSeeker: [
      "open to work", "looking for a job", "looking for work", "seeking a new role", "seeking a new job",
      "currently job hunting", "searching for opportunities", "available for work", "looking for my next opportunity",
      "seeking referrals", "can anyone refer me", "please refer me", "job search update",
      "à la recherche d'un emploi", "je cherche un emploi", "recherche un emploi", "recherche d'un poste",
      "je cherche un poste", "en recherche d'opportunités", "ouvert aux opportunités", "ouverte aux opportunités",
      "disponible immédiatement", "je cherche une alternance", "je cherche un stage",
      "je recherche un nouveau poste", "je recherche un poste", "je recherche un emploi",
      "je recherche activement", "je suis à l'écoute", "à l'écoute de nouvelles opportunités",
      "à l'écoute du marché", "à la recherche de nouvelles opportunités", "je souhaite intégrer une entreprise",
      "disponible pour étudier toute opportunité", "je suis en recherche d'emploi", "recherche activement un poste",
      "i am looking for a new role", "i am looking for a new position", "i am looking for my next",
      "open to opportunities", "open to new opportunities", "seeking new opportunities",
      "أبحث عن عمل", "أبحث عن وظيفة", "أبحث عن فرصة عمل", "أبحث عن منصب", "متاح للعمل",
      "باحث عن عمل", "باحثة عن عمل",
      "متاحة للعمل", "أبحث عن تدريب", "أبحث عن فرصة تدريب", "أحتاج إلى إحالة", "أبحث عن ترشيح",
      "مفتوح للعمل", "مفتوحة للعمل"
    ],

    adviceNews: [
      "hiring tips", "tips for hiring", "how to hire", "how we hire", "hiring strategy", "recruitment trends",
      "interview advice", "interview tips", "hiring process", "recruitment process", "what i look for when hiring",
      "look for when hiring", "interviewing", "what i learned", "lessons learned",
      "lessons from hiring", "hiring news", "hiring market", "future of hiring", "recruitment insights",
      "conseils de recrutement", "comment recruter", "stratégie de recrutement", "tendances du recrutement",
      "conseils d'entretien", "processus de recrutement", "actualités rh", "marché du recrutement",
      "retours d'expérience", "retour d'expérience", "témoignage", "témoignages", "nous raconte",
      "salon de l'emploi", "marque employeur", "congrès", "webinaire",
      "نصائح التوظيف", "كيفية التوظيف", "استراتيجيات التوظيف", "أخبار التوظيف", "اتجاهات سوق العمل",
      "نصائح المقابلة", "تجربة التوظيف", "سوق العمل",
      "استقالة", "الثقافة التنظيمية", "الحفاظ على المواهب", "بيئة العمل", "الاحتفاظ بالموظفين",
      "سوق الوظائف", "عالم التوظيف"
    ],

    closedOrNegative: [
      "not hiring", "we are not hiring", "we're not hiring", "not currently hiring", "not actively hiring",
      "no longer hiring", "not recruiting", "not currently recruiting", "not actively recruiting",
      "no longer recruiting", "not looking for candidates", "no longer looking for candidates", "no open roles", "no open positions",
      "position filled", "role has been filled", "applications closed", "hiring freeze", "no longer accepting applications",
      "job cancelled", "job canceled", "not accepting applications", "nous ne recrutons pas", "ne recrutons plus",
      "ne recherchons plus", "aucun poste ouvert",
      "poste pourvu", "poste déjà pourvu", "candidatures clôturées", "recrutement suspendu", "offre expirée",
      "لا نوظف حاليا", "لا نوظف حاليًا", "لا توجد وظائف شاغرة", "تم شغل المنصب", "تم إغلاق التقديم",
      "التقديم مغلق", "تم إلغاء الوظيفة", "التوظيف متوقف", "توقف التوظيف"
    ],

    hiringHashtags: [
      "hiring", "werehiring", "wearehiring", "nowhiring", "recruiting", "recruitment", "talentacquisition",
      "jobopening", "jobopenings", "jobopportunity", "careers", "referral", "internship", "graduatejobs",
      "recrutement", "onrecrute", "nousrecrutons", "emploi", "offredemploi", "offresdemploi", "cdi", "cdd",
      "stage", "alternance", "rechercheemploi", "توظيف", "وظائف", "فرص_عمل", "وظيفة_شاغرة",
      "مطلوب_موظفين", "فرصة_عمل", "توظيف_فوري", "بحث_عن_عمل", "سيرة_ذاتية", "تدريب"
    ],

    contactCues: [
      "email me", "contact me", "send your cv to", "send your resume to", "reach out to me", "dm me",
      "message me", "whatsapp me", "telegram me", "send your details", "email your application",
      "contactez-moi", "contactez moi", "envoyez-moi un message", "envoyez moi un message", "par email",
      "par courriel", "contactez-nous", "راسلني", "تواصل معي", "أرسل لي", "على البريد الإلكتروني",
      "عبر البريد", "واتساب", "تليغرام"
    ],

    jobLinkPatterns: [
      "/jobs/", "/job/", "/careers", "/career", "/work-with-us", "/join-us", "greenhouse.io",
      "lever.co", "ashbyhq.com", "workdayjobs.com", "smartrecruiters.com", "jobvite.com",
      "teamtailor.com", "recruitee.com", "indeed.", "bayt.com", "tanqeeb.com", "emploitic.com"
    ]
  };
})();
