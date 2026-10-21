(() => {
  "use strict";

  // Keyword groups intentionally exclude job-title families. They are signals,
  // not a guarantee that a post contains an active vacancy.
  globalThis.__LI_FEED_HIRING_RULES__ = {
    activeOpening: [
      // English
      "we're hiring", "we are hiring", "we're actively hiring", "we are actively hiring",
      "now hiring", "hiring now", "actively hiring", "currently hiring", "our team is hiring",
      "we're recruiting", "we are recruiting", "currently recruiting", "we're looking to hire",
      "we are looking to hire", "we have an opening", "we have openings", "open role", "open roles",
      "open position", "open positions", "job opening", "job openings", "position available",
      "positions available", "role available", "roles available", "join our team", "come work with us",
      "our team is growing", "applications are open", "applications now open", "referrals welcome",
      "we're expanding our team", "we are expanding our team", "hiring for", "vacancy available",
      // French
      "nous recrutons", "on recrute", "nous embauchons", "on embauche", "recrutement en cours",
      "nous recherchons des candidats", "nous recherchons", "on recherche", "poste à pourvoir",
      "postes à pourvoir", "poste vacant", "postes vacants", "offre d'emploi", "offres d'emploi",
      "plusieurs postes ouverts", "poste ouvert", "postes ouverts", "rejoignez notre équipe",
      "rejoignez-nous", "intégrer notre équipe", "notre équipe s'agrandit", "candidatures ouvertes",
      "nous acceptons les candidatures", "recrutement urgent", "profil recherché", "profils recherchés",
      "nous cherchons des candidats", "nous avons des postes", "poste à combler", "postes à combler",
      // Arabic
      "نحن نوظف", "نحن بصدد التوظيف", "نقوم بالتوظيف", "إعلان توظيف", "نبحث عن موظف",
      "نبحث عن موظفين", "نبحث عن مرشح", "نبحث عن مرشحين", "مطلوب للعمل", "مطلوب موظف",
      "مطلوب موظفين", "مطلوبة للعمل", "فرصة عمل", "فرص عمل", "وظيفة شاغرة", "وظائف شاغرة",
      "منصب شاغر", "مناصب شاغرة", "انضم إلى فريقنا", "انضمي إلى فريقنا", "انضموا إلى فريقنا",
      "التقديم مفتوح", "باب التقديم مفتوح", "نستقبل طلبات التوظيف", "التوظيف مستمر", "توظيف فوري",
      "توظيف عاجل", "نحتاج إلى موظف", "نحتاج إلى موظفين", "أرسل سيرتك الذاتية", "أرسلوا السيرة الذاتية",
      "للتقديم يرجى", "للتقديم أرسل", "فرصة تدريب", "تدريب متاح",
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
      "application link", "careers page", "full time", "part time", "permanent position", "contract role",
      "temporary role", "freelance role", "remote position", "hybrid position", "internship", "internships",
      "graduate role", "apprenticeship", "emploi", "emplois", "poste", "postes", "fonction", "mission",
      "opportunité d'emploi", "opportunités d'emploi", "opportunité professionnelle", "opportunités professionnelles",
      "cdi", "cdd", "intérim", "temps plein", "temps partiel", "freelance", "stage", "alternance",
      "apprentissage", "télétravail", "emploi à distance", "وظيفة", "وظائف", "عمل", "أعمال", "فرصة مهنية",
      "منصب", "مناصب", "شاغر", "شواغر", "طلب توظيف", "استمارة التقديم", "رابط التقديم", "وصف الوظيفة",
      "دوام كامل", "دوام جزئي", "عقد دائم", "عقد محدد المدة", "عمل مؤقت", "عمل حر", "تدريب", "متدرب",
      "تدريب مهني", "حديث التخرج", "عمل عن بعد", "دوام هجين"
    ],

    applicationCta: [
      "apply now", "apply here", "apply today", "please apply", "how to apply", "submit your application",
      "send your resume", "send your cv", "email your cv", "send me your cv", "dm me your cv",
      "share your resume", "applications close", "apply by", "application deadline", "application link",
      "postulez", "postulez ici", "postulez dès maintenant", "comment postuler", "envoyez votre cv",
      "envoyez-moi votre cv", "transmettez votre cv", "envoyez votre candidature", "déposez votre candidature",
      "candidature à envoyer", "merci d'envoyer votre cv", "cv et lettre de motivation", "lien de candidature",
      "قدّم طلبك", "قدم طلبك", "للتقديم", "للتقديم يرجى", "أرسل سيرتك الذاتية", "أرسلوا السيرة الذاتية",
      "أرسل سيرتك", "يرجى إرسال السيرة الذاتية", "رابط التقديم", "التقديم عبر الرابط", "املأ استمارة التقديم"
    ],

    jobSeeker: [
      "open to work", "looking for a job", "looking for work", "seeking a new role", "seeking a new job",
      "currently job hunting", "searching for opportunities", "available for work", "looking for my next opportunity",
      "seeking referrals", "can anyone refer me", "please refer me", "job search update",
      "à la recherche d'un emploi", "je cherche un emploi", "recherche un emploi", "recherche d'un poste",
      "je cherche un poste", "en recherche d'opportunités", "ouvert aux opportunités", "ouverte aux opportunités",
      "disponible immédiatement", "je cherche une alternance", "je cherche un stage", "recommandation",
      "parrainage", "أبحث عن عمل", "أبحث عن وظيفة", "أبحث عن فرصة عمل", "أبحث عن منصب", "متاح للعمل",
      "متاحة للعمل", "أبحث عن تدريب", "أبحث عن فرصة تدريب", "أحتاج إلى إحالة", "أبحث عن ترشيح",
      "مفتوح للعمل", "مفتوحة للعمل"
    ],

    adviceNews: [
      "hiring tips", "tips for hiring", "how to hire", "how we hire", "hiring strategy", "recruitment trends",
      "interview advice", "interview tips", "hiring process", "recruitment process", "what i look for when hiring",
      "lessons from hiring", "hiring news", "hiring market", "future of hiring", "recruitment insights",
      "conseils de recrutement", "comment recruter", "stratégie de recrutement", "tendances du recrutement",
      "conseils d'entretien", "processus de recrutement", "actualités rh", "marché du recrutement",
      "نصائح التوظيف", "كيفية التوظيف", "استراتيجيات التوظيف", "أخبار التوظيف", "اتجاهات سوق العمل",
      "نصائح المقابلة", "تجربة التوظيف", "سوق العمل"
    ],

    closedOrNegative: [
      "not hiring", "we are not hiring", "we're not hiring", "no open roles", "no open positions",
      "position filled", "role has been filled", "applications closed", "hiring freeze", "no longer accepting applications",
      "job cancelled", "job canceled", "not accepting applications", "nous ne recrutons pas", "aucun poste ouvert",
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
