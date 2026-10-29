(() => {
  "use strict";

  // Idempotent load: programmatic re-injection must not rebuild the rule tables.
  if (globalThis.__LI_FEED_HIRING_RULES__) return;

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
      // Spanish
      "estamos contratando", "estamos reclutando", "reclutamiento en curso", "contratación inmediata",
      "contratación urgente", "oferta de empleo", "ofertas de empleo", "vacante disponible",
      "vacantes disponibles", "puesto disponible", "puestos disponibles", "puesto vacante", "puestos vacantes",
      "plaza disponible", "plazas disponibles", "buscamos personal", "buscamos candidatos", "buscamos candidatas",
      "buscamos profesionales", "buscamos incorporar", "incorporación inmediata", "se busca personal",
      "se busca candidato", "se busca candidata", "se necesitan profesionales", "buscamos un", "buscamos una",
      "estamos buscando", "estamos en búsqueda de",
      // German
      "wir stellen ein", "wir suchen", "wir suchen verstärkung", "wir suchen mitarbeiter",
      "wir suchen mitarbeiterinnen", "wir rekrutieren", "wir sind auf der suche nach",
      "verstärkung gesucht", "mitarbeiter gesucht", "mitarbeiterin gesucht", "dringend gesucht",
      "sofort einstellen", "einstellung sofort", "offene stelle", "offene stellen", "freie stelle",
      "freie stellen", "stelle zu besetzen", "stellen zu besetzen", "stellenangebot", "stellenangebote",
      "stellenausschreibung", "vakanz", "wir haben eine stelle", "wir haben stellen",
      // Portuguese
      "estamos contratando", "estamos a contratar", "contratamos", "contratação imediata",
      "contratação urgente", "vaga disponível", "vagas disponíveis", "vaga aberta", "vagas abertas",
      "oferta de emprego", "ofertas de emprego", "procuramos candidatos", "procuramos candidatas",
      "procuramos profissional", "procuramos profissionais", "estamos recrutando", "recrutamento em andamento",
      "recrutamento urgente", "estamos à procura de", "contrata-se", "recruta-se"
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
      "فرصة عمل", "فرص عمل", "فرصة تدريب", "تدريب متاح",
      // Spanish
      "únete a nuestro equipo", "únete al equipo", "nuestro equipo está creciendo",
      "postulaciones abiertas", "inscripciones abiertas", "ven a trabajar con nosotros",
      "trabaja con nosotros", "descubre nuestras ofertas", "conoce nuestras vacantes",
      "oportunidad laboral", "oportunidades laborales",
      // German
      "werde teil unseres teams", "komm zu uns", "unser team wächst", "wir wachsen",
      "bewerbungen sind offen", "bewerbungen willkommen", "schau dir unsere stellen an",
      "entdecke unsere stellenangebote", "karrierechance", "karrierechancen", "arbeite mit uns",
      // Portuguese
      "junte-se ao nosso time", "junte-se à nossa equipe", "venha trabalhar conosco",
      "nosso time está crescendo", "nossa equipe está crescendo", "candidaturas abertas",
      "inscrições abertas", "confira nossas vagas", "descubra nossas vagas",
      "oportunidade de emprego", "oportunidades de emprego", "trabalhe conosco"
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
      "المنصب\\s+المطلوب\\s*(?:[:|]|$)",
      // Spanish: "buscamos un/una …", "se busca un …", "se necesitan …".
      "buscamos\\s+(?:un|una|unos|unas|\\d)\\b",
      // Article-less Spanish headline: "Buscamos comercial", "Buscamos comerciales para …".
      // Abstract complements ("buscamos la excelencia") are excluded so marketing copy stays out.
      "buscamos\\s+(?!(?:la|el|los|las|ser|estar|mejorar|ofrecer|crecer|gente|talento|algo|mas|soluciones|excelencia)\\b)\\p{L}{3,}(?:\\s+\\p{L}{2,}){0,2}(?=\\s*(?:[.,;!?|]|para\\b|en\\b|con\\b|$))",
      "se\\s+busca\\s+(?:un|una|\\d)\\b",
      "se\\s+necesita(?:n)?\\s+(?:un|una|\\d)\\b",
      "estamos\\s+(?:contratando|buscando)\\s+(?:un|una|a|\\d)\\b",
      // German: "wir suchen …", "… gesucht", "wir stellen … ein".
      "wir\\s+suchen\\s+(?:einen|eine|ein|\\d)\\b",
      "(?:mitarbeiter|mitarbeiterin|verstärkung|kollegin|kollegen)\\s+gesucht\\b",
      "wir\\s+stellen\\s+(?:einen|eine|ein|\\d)\\b[^.!?]{0,40}\\bein\\b",
      // Portuguese: "procuramos um …", "contrata-se …", "estamos a contratar".
      "procuramos\\s+(?:um|uma|uns|umas|\\d)\\b",
      "estamos\\s+(?:a\\s+contratar|contratando|recrutando)\\b",
      "contrata-se\\b", "recruta-se\\b",
      // Spanish headline form without an article: "Se busca camarero", "Se necesitan
      // comerciales". The lookahead keeps seeker posts ("se busca empleo") out.
      "se\\s+(?:busca(?:n)?|necesita(?:n)?)\\s+(?:(?:un|una|unos|unas|\\d+)\\s+)?(?!(?:empleo|trabajo|oportunidad(?:es)?)\\b)\\p{L}{3,}(?:\\s+\\p{L}{2,}){0,2}",
      // German headline form: "Gesucht: Pflegefachkraft", "Gesucht wird ein …".
      "(?:^|[.!?]\\s)gesucht\\s*:?\\s*\\p{L}",
      // Portuguese headline form: "Procura-se empregado de mesa", "Contratam-se comerciais".
      "(?:procura-se|contratam-se|recrutam-se|buscam-se)\\s+(?!(?:emprego|trabalho|oportunidade)\\b)\\p{L}",
      // Portuguese headline form: "Vaga para designer", "Vagas de comercial".
      "(?:^|[.!?]\\s)(?:vaga|vagas)\\s+(?:para|de)\\s+\\p{L}"
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
      "الشروط", "المؤهلات", "المنصب المطلوب", "مهام الوظيفة", "خبرة مهنية", "مكان العمل", "طبيعة العقد",
      // Spanish
      "(h/m)", "m/h", "puesto:", "funciones:", "requisitos:", "descripción del puesto",
      "tipo de contrato", "lugar de trabajo", "experiencia requerida", "experiencia profesional",
      "tus funciones", "responsabilidades:", "lo que buscamos", "lo que ofrecemos",
      // German
      "(m/w/d)", "m/w/d", "w/m/d", "m/w/x", "aufgaben:", "ihre aufgaben", "deine aufgaben",
      "anforderungen:", "ihr profil", "dein profil", "stellenbeschreibung", "arbeitsort",
      "vertragsart", "berufserfahrung", "qualifikationen", "wir bieten",
      // Portuguese
      "(m/f)", "m/f", "f/m", "funções:", "responsabilidades:", "requisitos:", "descrição da vaga",
      "local de trabalho", "tipo de contrato", "experiência profissional", "qualificações",
      "o que você vai fazer", "o que oferecemos", "atribuições:"
    ],

    // Intake phrasing whose grammatical object is a role or position, as opposed to a
    // programme, grant, exam, or event. Structural only: no occupational title families.
    roleMarkerFrames: [
      "(?:applications?|candidatures?)\\s+(?:are|is|now|sont|est)?\\s*(?:open|ouvertes?)\\s+(?:for|pour|to)\\s+(?:the|a|an|our|le|la|les|un|une|notre|nos)\\s+[\\p{L}\\s'\'-]{0,40}?\\b(?:role|position|job|poste|emploi|fonction)\\b",
      "(?:we|on|nous)\\s+(?:are\\s+)?(?:hiring|recruiting|recrute|recrutons)\\s+(?:for\\s+)?(?:a|an|the|un|une|le|la|des|du)\\s+[\\p{L}\\s'\'-]{0,40}?\\b(?:role|position|job|poste|emploi)\\b",
      // Spanish: "buscamos un/una … para el puesto/vacante de …".
      "(?:buscamos|se\\s+busca|se\\s+necesita)\\s+(?:un|una|\\d)\\s+[\\p{L}\\s'’-]{0,40}?\\b(?:puesto|vacante|empleo|plaza)\\b",
      // German: "wir suchen einen/eine … für die Stelle/Position".
      "(?:wir\\s+suchen|gesucht\\s+wird)\\s+(?:einen|eine|ein|\\d)\\s+[\\p{L}\\s'’-]{0,40}?\\b(?:stelle|position|anstellung)\\b",
      // Portuguese: "procuramos um/uma … para a vaga/posição".
      "(?:procuramos|buscamos|contrata-se)\\s+(?:um|uma|\\d)\\s+[\\p{L}\\s'’-]{0,40}?\\b(?:vaga|posição|cargo|emprego)\\b"
    ],

    // Sponsored and promoted placements are advertising, not posts. A promoted post that
    // still names a vacancy keeps its normal classification; platform and brand advertising
    // that names none must never enter the opening buckets.
    sponsoredMarkers: [
      "post sponsorisé", "publication sponsorisée", "annonce sponsorisée", "sponsorisé",
      "sponsored post", "sponsored", "promoted post", "promoted",
      "منشور ممول", "إعلان ممول", "ممول",
      // Spanish / German / Portuguese
      "publicación patrocinada", "contenido patrocinado", "patrocinado",
      "gesponserter beitrag", "gesponsert", "anzeige", "werbung",
      "publicação patrocinada", "conteúdo patrocinado", "patrocinado"
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
      "على\\s+استعداد\\s+(?:للعمل|للانضمام)\\b",
      // Spanish: seeker looks for a job, not an employer looking for a person.
      "busco\\s+(?:un|una|nuevo|nueva|mi)\\s*(?:\\p{L}+\\s+){0,2}?(?:empleo|trabajo|puesto|oportunidad|práctica|pasantía|contrato)\\b",
      "estoy\\s+(?:buscando|en\\s+búsqueda\\s+de)\\s+(?:un|una|nuevas?|nuevo|mi)\\s*(?:\\p{L}+\\s+){0,2}?(?:empleo|trabajo|puesto|oportunidad)\\b",
      "abierto\\s+a\\s+(?:nuevas\\s+)?(?:oportunidades|ofertas)\\b",
      "en\\s+búsqueda\\s+activa\\s+de\\s+(?:empleo|trabajo|oportunidades)\\b",
      "disponible\\s+para\\s+(?:trabajar|incorporarme)\\b",
      // German
      "ich\\s+(?:suche|bin\\s+auf\\s+der\\s+suche\\s+nach)\\s+(?:einen|eine|ein|neue|neuen|meinen|meine)\\s*(?:\\p{L}+\\s+){0,2}?(?:job|stelle|arbeit|anstellung|position)\\b",
      "offen\\s+für\\s+(?:neue\\s+)?(?:möglichkeiten|stellen|jobs)\\b",
      "auf\\s+der\\s+suche\\s+nach\\s+(?:einer\\s+neuen\\s+)?(?:stelle|arbeit|anstellung)\\b",
      "verfügbar\\s+für\\s+(?:eine\\s+neue\\s+)?(?:stelle|anstellung)\\b",
      // Portuguese
      "estou\\s+(?:buscando|à\\s+procura\\s+de|em\\s+busca\\s+de)\\s+(?:um|uma|novo|nova|meu|minha)\\s*(?:\\p{L}+\\s+){0,2}?(?:emprego|trabalho|vaga|cargo|oportunidade|estágio)\\b",
      "aberto\\s+a\\s+(?:novas\\s+)?(?:oportunidades|vagas)\\b",
      "disponível\\s+para\\s+(?:trabalhar|novas\\s+oportunidades)\\b",
      "em\\s+busca\\s+de\\s+(?:uma\\s+)?(?:nova\\s+)?(?:oportunidade|vaga|colocação)\\b"
    ],

    // Clause connectives that end a negation's scope. Without them a negation in one clause
    // suppresses a genuine signal in the next ("we are not hiring, but …").
    negationConnectives: [
      "but", "however", "though", "although", "yet", "whereas",
      "mais", "cependant", "toutefois", "par contre", "pourtant",
      "لكن", "ولكن", "بل", "الا ان", "غير ان",
      // Spanish / German / Portuguese
      "pero", "sin embargo", "aunque", "no obstante", "sino",
      "aber", "jedoch", "allerdings", "obwohl", "sondern",
      "mas", "porém", "contudo", "embora", "entretanto", "senão"
    ],

    // Optional Algerian dialect / Arabizi spellings are deliberately weak and noisy signals.
    weakRegional: [
      "رانا نبحثو على", "رانا نقلبو على", "نقلبو على موظف", "نحتاجو موظف", "لي مهتم يبعث",
      "اللي مهتم يبعث", "ابعثلي السيرة الذاتية", "كاين منصب", "كاين مناصب", "recrutement à alger",
      "recrutement à oran", "rana nlawjo 3la", "rana nqelbo 3la", "rani nlawj 3la",
      "kayen poste", "kayn poste", "li yhemmo yb3ath", "sift cv", "siftili cv", "n7tajou",
      // Spanish / German / Portuguese regional and informal spellings.
      "busco trabajo en", "busco empleo en", "se busca personal en", "vacante en",
      "suche arbeit in", "suche job in", "stelle in", "wir suchen dich",
      "procuro emprego em", "busco emprego em", "vaga em", "estamos contratando para"
    ],

    // C7: the dialect signal used to be Algerian-only. Split by family so an export can say
    // which regional register matched instead of a single opaque boolean.
    weakRegionalMaghreb: [
      "رانا نبحثو على", "نقلبو على موظف", "نحتاجو موظف", "كاين منصب", "ابعثلي السيرة الذاتية",
      "recrutement à alger", "recrutement à oran", "rana nlawjo 3la", "kayen poste", "n7tajou",
      "نبحثو على", "خدمة", "التوظيف في الجزائر", "المغرب", "تونس", "الدار البيضاء", "تونس العاصمة"
    ],

    weakRegionalGulf: [
      "مطلوب موظف", "وظيفة شاغرة", "دوام كامل", "الراتب", "الرياض", "جدة", "الدمام", "دبي",
      "أبوظبي", "الشارقة", "الكويت", "قطر", "الدوحة", "البحرين", "مسقط", "عمان", "ريال", "درهم", "دينار"
    ],

    weakRegionalLevant: [
      "مطلوب للعمل", "بحاجة لموظف", "شاغر", "سوريا", "دمشق", "حلب", "لبنان", "بيروت",
      "الأردن", "عمّان", "فلسطين", "غزة", "رام الله", "نبحث عن موظف"
    ],

    weakRegionalEgypt: [
      "مطلوب موظفين", "مطلوب للعمل", "شغل", "القاهرة", "الجيزة", "الإسكندرية", "مصر",
      "جنيه", "خبرة سنوات", "وظائف مصر", "التقديم فورا"
    ],


    recruiterSearch: [
      "recruiting for", "recruiter looking for", "recruiter seeking", "looking for candidates",
      "seeking candidates", "searching for candidates", "we need candidates", "sourcing candidates",
      "candidate search", "talent search", "reach out to candidates", "referrals for this role",
      "recherchons des candidats", "recherche de candidats", "recherche candidats", "recherche de profils",
      "nous recherchons des profils", "candidats recherchés", "profils recherchés", "sourcing de candidats",
      "نبحث عن مرشحين", "نبحث عن مترشحين", "نبحث عن كفاءات", "نبحث عن مواهب", "مطلوب مرشح",
      "مطلوب مرشحين", "استقطاب مرشحين", "استقطاب المواهب",
      // Spanish / German / Portuguese
      "buscamos candidatos", "buscando candidatos", "en busca de candidatos", "reclutando para",
      "seleccionando candidatos", "buscamos perfiles", "perfiles buscados", "atracción de talento",
      "sourcing de candidatos",
      "wir suchen kandidaten", "kandidaten gesucht", "wir suchen talente", "talentakquise",
      "personalvermittlung", "wir rekrutieren für", "kandidatensuche", "talent sourcing",
      "procuramos candidatos", "buscamos candidatos", "em busca de candidatos", "recrutando para",
      "buscamos perfis", "perfis procurados", "atração de talentos", "sourcing de candidatos"
    ],

    recruiterTerms: [
      "recruiter", "recruiters", "recruitment", "recruiting", "talent acquisition", "talent partner",
      "talent sourcer", "sourcer", "headhunter", "executive search", "staffing agency", "hiring manager",
      "people team", "human resources", "hr business partner", "people operations",
      "recruteur", "recruteuse", "recrutement", "chargé de recrutement", "chargée de recrutement",
      "responsable recrutement", "consultant en recrutement", "cabinet de recrutement", "chasseur de têtes",
      "acquisition de talents", "ressources humaines", "responsable rh", "استقطاب المواهب",
      "مسؤول توظيف", "مسؤولة توظيف", "أخصائي توظيف", "أخصائية توظيف", "موارد بشرية",
      "الموارد البشرية", "إدارة الموارد البشرية", "شركة توظيف", "مكتب توظيف", "وكالة توظيف",
      // Spanish / German / Portuguese
      "reclutador", "reclutadora", "reclutamiento", "selección de personal", "adquisición de talento",
      "recursos humanos", "agencia de empleo", "consultor de selección",
      "recruiter", "recruiterin", "personalberater", "personalberaterin", "personalvermittlung",
      "talent acquisition", "personalbeschaffung", "human resources", "personalabteilung",
      "headhunter", "zeitarbeitsfirma",
      "recrutador", "recrutadora", "recrutamento", "seleção de pessoal", "aquisição de talentos",
      "recursos humanos", "agência de emprego", "consultor de recrutamento"
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
      "حديث التخرج",
      // Spanish / German / Portuguese
      "empleo", "empleos", "puesto", "puestos", "vacante", "vacantes",
      "oportunidad laboral", "oportunidades laborales", "oferta de empleo", "ofertas de empleo",
      "descripción del puesto", "enlace de postulación", "portal de empleo",
      "job", "jobs", "stelle", "stellen", "anstellung", "stellenangebot", "stellenangebote",
      "vakanz", "vakanzen", "karrieremöglichkeit", "karrieremöglichkeiten", "stellenbeschreibung",
      "bewerbungslink", "karriereseite",
      "emprego", "empregos", "vaga", "vagas", "cargo", "cargos",
      "oportunidade de emprego", "oportunidades de emprego", "oferta de emprego", "ofertas de emprego",
      "descrição da vaga", "link de candidatura", "página de carreiras"
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
      "تدريب مهني", "عمل عن بعد", "دوام هجين",
      // Spanish / German / Portuguese
      "tiempo completo", "tiempo parcial", "jornada completa", "jornada parcial",
      "contrato indefinido", "contrato temporal", "trabajo remoto", "teletrabajo", "híbrido",
      "prácticas", "pasantía", "becario", "freelance",
      "vollzeit", "teilzeit", "unbefristet", "befristet", "festanstellung", "werkvertrag",
      "homeoffice", "remote", "hybrid", "praktikum", "ausbildung", "duale ausbildung", "freelance",
      "tempo integral", "tempo parcial", "contrato efetivo", "contrato temporário",
      "trabalho remoto", "remoto", "híbrido", "estágio", "aprendiz", "freelance", "meio período"
    ],

    applicationCta: [
      // English
      "apply now", "apply here", "apply today", "please apply", "how to apply", "submit your application",
      "send your resume", "send your cv", "email your cv", "send me your cv", "dm me your cv",
      "share your resume", "applications close", "apply by", "application deadline", "application link",
      // French
      "postulez", "postulez ici", "postulez dès maintenant", "comment postuler", "envoyez votre cv",
      "envoyez-moi votre cv", "transmettez votre cv", "envoyez votre candidature", "déposez votre candidature",
      "candidature à envoyer", "merci d'envoyer votre cv", "cv et lettre de motivation", "lien de candidature",
      "pour candidater", "par ici pour candidater", "candidater dès maintenant", "pour postuler",
      // Arabic
      "قدّم طلبك", "قدم طلبك", "للتقديم", "للتقديم يرجى", "أرسل سيرتك الذاتية", "أرسلوا السيرة الذاتية",
      "أرسل سيرتك", "يرجى إرسال السيرة الذاتية", "رابط التقديم", "التقديم عبر الرابط", "املأ استمارة التقديم",
      "قدم الآن", "أرسل طلبك", "سجل الآن", "يرجى التقديم عبر الرابط", "التقديم متاح عبر الرابط",
      // Maghrebi dialect phrasing seen in dialect-only posts; kept literal because the
      // prefix form ("يبعثلي") never matches a bare "ابعثلي" phrase.
      "يبعثلي السيرة الذاتية",
      // Spanish / German / Portuguese
      "postúlate", "postula ahora", "postula aquí", "aplica ahora", "aplica aquí",
      "cómo postular", "envía tu cv", "envía tu currículum", "envía tu solicitud",
      "fecha límite", "enlace de postulación", "inscríbete", "manda tu cv", "comparte tu currículum",
      "jetzt bewerben", "hier bewerben", "bewirb dich", "bewerben sie sich", "wie bewerben",
      "lebenslauf senden", "sende deinen lebenslauf", "bewerbung senden", "bewerbungsschluss",
      "bewerbungsfrist", "bewerbungslink", "cv einsenden",
      "candidate-se", "candidatar-se", "inscreva-se", "envie seu currículo", "envie seu cv",
      "como se candidatar", "prazo de candidatura", "link de candidatura", "aplique agora",
      "candidate agora"
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
      "مفتوح للعمل", "مفتوحة للعمل",
      // Spanish / German / Portuguese
      "busco empleo", "busco trabajo", "en búsqueda de empleo", "en busca de trabajo",
      "abierto a oportunidades", "abierta a oportunidades", "disponible para trabajar",
      "busco nuevas oportunidades", "busco mi próximo empleo", "estoy disponible",
      "en búsqueda activa",
      "suche job", "suche arbeit", "suche neue stelle", "auf der suche nach einer neuen stelle",
      "offen für neue möglichkeiten", "offen für neue chancen", "verfügbar für arbeit",
      "ich bin auf jobsuche", "jobsuche", "stellensuchend",
      "procuro emprego", "busco emprego", "em busca de emprego", "à procura de emprego",
      "aberto a oportunidades", "aberta a oportunidades", "disponível para trabalhar",
      "busco novas oportunidades", "estou em busca de uma nova oportunidade", "em transição de carreira"
    ],

    adviceNews: [
      // English
      "hiring tips", "tips for hiring", "how to hire", "how we hire", "hiring strategy", "recruitment trends",
      "interview advice", "interview tips", "hiring process", "recruitment process", "what i look for when hiring",
      "look for when hiring", "interviewing", "what i learned", "lessons learned",
      "lessons from hiring", "hiring news", "hiring market", "future of hiring", "recruitment insights",
      // French
      "conseils de recrutement", "comment recruter", "stratégie de recrutement", "tendances du recrutement",
      "conseils d'entretien", "processus de recrutement", "actualités rh", "marché du recrutement",
      "retours d'expérience", "retour d'expérience", "témoignage", "témoignages", "nous raconte",
      "salon de l'emploi", "marque employeur", "congrès", "webinaire",
      // Arabic
      "نصائح التوظيف", "كيفية التوظيف", "استراتيجيات التوظيف", "أخبار التوظيف", "اتجاهات سوق العمل",
      "نصائح المقابلة", "تجربة التوظيف", "سوق العمل",
      "استقالة", "الثقافة التنظيمية", "الحفاظ على المواهب", "بيئة العمل", "الاحتفاظ بالموظفين",
      "سوق الوظائف", "عالم التوظيف", "نصائح لكتابة السيرة الذاتية", "كيف تجتاز المقابلة",
      "أخطاء شائعة في التوظيف", "أفضل ممارسات التوظيف",
      // Spanish / German / Portuguese
      "consejos de contratación", "cómo contratar", "estrategia de contratación",
      "tendencias de reclutamiento", "consejos para entrevistas", "proceso de selección",
      "noticias de empleo", "mercado laboral", "marca empleadora", "feria de empleo", "webinario",
      "tipps zur einstellung", "wie man einstellt", "recruiting-strategie", "recruiting-trends",
      "interview-tipps", "bewerbungsgespräch tipps", "einstellungsprozess", "arbeitsmarkt",
      "employer branding", "jobmesse", "webinar",
      "dicas de contratação", "como contratar", "estratégia de recrutamento",
      "tendências de recrutamento", "dicas de entrevista", "processo seletivo",
      "mercado de trabalho", "notícias de emprego", "marca empregadora", "feira de empregos", "webinário"
    ],

    closedOrNegative: [
      // English
      "not hiring", "we are not hiring", "we're not hiring", "not currently hiring", "not actively hiring",
      "no longer hiring", "not recruiting", "not currently recruiting", "not actively recruiting",
      "no longer recruiting", "not looking for candidates", "no longer looking for candidates", "no open roles", "no open positions",
      "position filled", "role has been filled", "applications closed", "hiring freeze", "no longer accepting applications",
      "job cancelled", "job canceled", "not accepting applications",
      // French
      "nous ne recrutons pas", "ne recrutons plus",
      "ne recherchons plus", "aucun poste ouvert",
      "poste pourvu", "poste déjà pourvu", "candidatures clôturées", "recrutement suspendu", "offre expirée",
      // Arabic
      "لا نوظف حاليا", "لا توجد وظائف شاغرة", "تم شغل المنصب", "تم إغلاق التقديم",
      "التقديم مغلق", "تم إلغاء الوظيفة", "التوظيف متوقف", "توقف التوظيف",
      "لا نبحث عن موظفين", "لا يوجد منصب شاغر", "لا توجد وظائف متاحة", "تم إغلاق باب التقديم",
      "انتهى التقديم", "تم تعيين شخص آخر", "تم إلغاء الإعلان", "تم تأجيل التوظيف",
      "لا نقوم بالتوظيف في الوقت الحالي", "تم إيقاف استقبال الطلبات", "الوظيفة لم تعد متاحة",
      "تم تعبئة الشاغر", "انتهت صلاحية الإعلان",
      // Spanish / German / Portuguese
      "no estamos contratando", "ya no contratamos", "no buscamos candidatos", "no hay vacantes",
      "sin vacantes", "puesto cubierto", "vacante cubierta", "proceso cerrado",
      "candidaturas cerradas", "búsqueda cerrada", "contratación congelada",
      "ya no aceptamos solicitudes", "oferta caducada",
      "wir stellen nicht ein", "wir suchen nicht mehr", "keine offenen stellen", "stelle besetzt",
      "stellen besetzt", "bewerbungen geschlossen", "einstellungsstopp",
      "wir nehmen keine bewerbungen mehr an", "angebot abgelaufen", "stellenanzeige abgelaufen",
      "não estamos contratando", "não contratamos mais", "não há vagas", "sem vagas",
      "vaga preenchida", "vagas preenchidas", "candidaturas encerradas", "processo encerrado",
      "contratação congelada", "não aceitamos mais candidaturas", "oferta expirada"
    ],

    hiringHashtags: [
      "hiring", "werehiring", "wearehiring", "nowhiring", "recruiting", "recruitment", "talentacquisition",
      "jobopening", "jobopenings", "jobopportunity", "careers", "referral", "internship", "graduatejobs",
      "recrutement", "onrecrute", "nousrecrutons", "emploi", "offredemploi", "offresdemploi", "cdi", "cdd",
      "stage", "alternance", "rechercheemploi", "توظيف", "وظائف", "فرص_عمل", "وظيفة_شاغرة",
      "مطلوب_موظفين", "فرصة_عمل", "توظيف_فوري", "بحث_عن_عمل", "سيرة_ذاتية", "تدريب",
      // Spanish
      "empleo", "empleos", "ofertadeempleo", "ofertasdeempleo", "ofertadetrabajo", "vacante",
      "vacantes", "trabajo", "contratando", "reclutamiento", "seleccion", "oportunidadlaboral",
      "practicas", "beca", "buscamos",
      // German
      "stellenangebot", "stellenangebote", "stellenausschreibung", "job", "jobs", "arbeitsplatz",
      "arbeitsstellen", "bewerbung", "karriere", "einstellung", "wirsuchendich", "verstaerkung",
      "ausbildung", "praktikum", "neueStelle",
      // Portuguese
      "vagas", "vaga", "empregos", "emprego", "contratando", "recrutamento", "oportunidade",
      "estagio", "candidatura", "trabalheconosco", "novoemprego", "contratase"
    ],

    contactCues: [
      // English
      "email me", "contact me", "send your cv to", "send your resume to", "reach out to me", "dm me",
      "message me", "whatsapp me", "telegram me", "send your details", "email your application",
      // French
      "contactez-moi", "contactez moi", "envoyez-moi un message", "envoyez moi un message", "par email",
      "par courriel", "contactez-nous",
      // Arabic
      "راسلني", "تواصل معي", "أرسل لي", "على البريد الإلكتروني",
      "عبر البريد", "واتساب", "تليغرام", "على البريد", "تواصل معنا", "راسلني على البريد", "مراسلتي عبر البريد",
      // Spanish
      "envía tu cv", "envia tu cv", "envía tu currículum", "envia tu curriculum", "envía tu solicitud",
      "contáctame", "contactame", "escríbeme", "escribeme", "mándame un mensaje", "mandame un mensaje",
      "por correo electrónico", "por correo electronico", "contacta conmigo", "escríbeme por privado",
      // German
      "kontaktiere mich", "kontaktieren sie mich", "schreib mir", "schreiben sie mir",
      "sende deinen lebenslauf", "sende ihren lebenslauf", "lebenslauf an", "per e-mail",
      "melde dich bei mir", "nachricht an mich", "bewirb dich bei mir", "schick mir",
      // Portuguese
      "envie seu currículo", "envie seu curriculo", "envie seu cv", "mande seu currículo",
      "entre em contato comigo", "fale comigo", "me mande uma mensagem", "me chama no privado",
      "por e-mail", "pelo e-mail", "contate-me", "envie para o e-mail"
    ],

    jobLinkPatterns: [
      "/jobs/", "/job/", "/careers", "/career", "/work-with-us", "/join-us", "greenhouse.io",
      "lever.co", "ashbyhq.com", "workdayjobs.com", "smartrecruiters.com", "jobvite.com",
      "teamtailor.com", "recruitee.com", "indeed.", "bayt.com", "tanqeeb.com", "emploitic.com",
      // Spanish-language boards and paths
      "/empleos", "/empleo/", "/vacantes", "/vacante/", "/trabaja-con-nosotros", "/unete",
      "infojobs.", "computrabajo.", "empleate.", "elempleo.com", "bumeran.", "tecnoempleo.",
      // German-language boards and paths
      "/stellenangebote", "/stellenangebot/", "/karriere", "/jobs-und-karriere", "/arbeiten-bei-uns",
      "stepstone.", "xing.com/jobs", "indeed.de", "arbeitsagentur.de", "jobware.", "kimeta.",
      "meinestadt.", "stellenanzeigen.de", "kununu.com", "jobbörse",
      // Portuguese-language boards and paths
      "/vagas", "/vaga/", "/empregos", "/trabalhe-conosco", "/carreiras",
      "catho.", "vagas.com", "empregos.com", "solides.", "gupy.io", "99jobs.com", "kenoby.",
      "net-empregos.", "sine.com.br"
    ]
  };

  // Provenance: the digest covers the exact tables a classification was produced with,
  // so an exported verdict can be traced back to the rules that generated it. Computed
  // before the hash property is attached (otherwise the digest would include itself).
  const sha = globalThis.__LI_SHA256__ ||
    (typeof require === "function" ? require("./sha256.js") : null);
  if (!sha) throw new Error("SHA-256 primitives must load before the hiring rules.");
  const tables = globalThis.__LI_FEED_HIRING_RULES__;
  tables.tablesHash = sha.digest(JSON.stringify(tables));
})();
