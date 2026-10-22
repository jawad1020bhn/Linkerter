(() => {
  "use strict";

  const en = {
    "app.title": "Linkerter – Adaptive LinkedIn Feed",
    "app.eyebrow": "LINKEDIN FEED TOOL",
    "app.name": "Feed Assistant",
    "locale.label": "Language",
    "locale.auto": "Automatic",
    "locale.en": "English",
    "locale.fr": "Français",
    "locale.ar": "العربية",
    "onboarding.title": "Local, user-controlled assistance",
    "onboarding.body": "Linkerter scrolls and analyzes only the selected feed. It does not like, comment, connect, message, upload posts, or use an external AI service.",
    "onboarding.control": "You choose the pace, limits, history mode, and exports. Hidden-tab work may be throttled by Chrome.",
    "onboarding.policy": "Use responsibly and follow LinkedIn’s applicable terms. Review detections before acting on them.",
    "onboarding.dismiss": "Got it",
    "target.section": "Monitored LinkedIn tab",
    "target.detail": "Choose a LinkedIn feed tab. The selected target is remembered when you reopen this popup.",
    "target.useActive": "Use active feed tab",
    "target.return": "Return to feed",
    "tabs.scroll": "Scroll",
    "tabs.hiring": "Hiring filter",
    "notice.initial": "Open the LinkedIn feed to begin.",
    "scroll.ready": "READY",
    "scroll.start": "Start scrolling",
    "scroll.pause": "Pause",
    "scroll.stop": "Stop",
    "scroll.resume": "Resume scrolling",
    "scroll.running": "SCROLLING",
    "scroll.paused": "PAUSED",
    "scroll.stopped": "STOPPED",
    "scroll.progress": "Scroll-step limit progress",
    "scroll.statusReady": "Ready to scroll the LinkedIn feed.",
    "scroll.progressDetail": "{steps} / {max} steps · {elapsed} active",
    "pace.kicker": "ADAPTIVE SCROLL",
    "pace.title": "Smart pacing",
    "pace.badge": "AUTO-ADAPTIVE",
    "pace.modeLabel": "Adaptive mode",
    "pace.description": "Adaptive movement and pauses are automatic. The selected feed keeps scrolling in the background; Chrome may throttle hidden tabs.",
    "mode.standard": "Adaptive Standard",
    "mode.fast": "Adaptive Fast",
    "mode.super_fast": "Adaptive Super Fast",
    "mode.standardDescription": "Balanced adaptive movement with automatic reading pauses. Chrome may throttle hidden tabs.",
    "mode.fastDescription": "Quicker adaptive movement with variable waits and built-in reading pauses. Chrome may throttle hidden tabs.",
    "mode.super_fastDescription": "Highest adaptive pace, capped at 15 minutes / 120 steps, with pause-on-input locked on.",
    "limits.kicker": "SESSION GUARDRAILS",
    "limits.title": "Limits & safeguards",
    "limits.time": "Time limit",
    "limits.steps": "Step limit",
    "limits.pauseInput": "Pause on my input",
    "limits.pauseInputHelp": "Pause when you use the page.",
    "time.minutes": "{count} minutes",
    "steps.count": "{count} steps",
    "detector.kicker": "LOCAL DETECTION",
    "detector.title": "Recruiting & hiring",
    "detector.badge": "NO AI",
    "detector.copy": "The selected LinkedIn tab keeps scrolling and scanning posts in English, French, and Arabic while it is in the background. Chrome may throttle hidden tabs, and the feed tab must stay open.",
    "detector.autoExpand": "Auto-expand visible long posts",
    "detector.autoExpandHelp": "Only while the hiring monitor is running.",
    "detector.localNote": "Local keyword/context rules only. Review labels are private notes and never change detection; no role-title dictionary, uploads, or AI calls.",
    "monitor.start": "Start hiring monitor",
    "monitor.stop": "Stop hiring monitor",
    "monitor.off": "Monitor is off.",
    "monitor.running": "Monitoring this feed · {count} cards scanned",
    "monitor.stopped": "Monitor off · {count} cards scanned in the last run",
    "monitor.domPending": "Feed DOM check pending.",
    "history.label": "Save new post history",
    "history.off": "Off — do not save new posts",
    "history.session": "Browser session only",
    "history.persistent": "Persistent on this device",
    "history.help": "Off by default. Changing mode never copies old records; exports can read both stores.",
    "history.retention": "Retention",
    "history.days": "{count} days",
    "history.clear": "Clear saved history",
    "history.clearAll": "Clear all local data",
    "history.diagnostic": "Download sanitized diagnostic",
    "history.saved": "{count} saved posts",
    "history.offStatus": "Off · no post history is being saved.",
    "history.previous": "Off · {count} previously saved posts remain exportable until cleared.",
    "history.activeStatus": "{store} · {count} saved posts · {days}-day retention",
    "history.storeSession": "Session",
    "history.storePersistent": "Persistent",
    "metrics.aria": "Detected post counts",
    "category.open_role": "Openings",
    "category.recruiter_search": "Recruiter searches",
    "category.possible": "Possible matches",
    "category.job_seeker": "Job seekers / referrals",
    "category.hiring_discussion": "Hiring advice / news",
    "category.closed": "Closed / negative",
    "category.partial": "Partial text",
    "category.none": "No hiring signal",
    "category.other": "Other related",
    "results.kicker": "LIVE RESULTS",
    "results.title": "Detected posts",
    "results.filter": "Filter results",
    "results.all": "All detected",
    "results.search": "Search detected posts",
    "results.search.placeholder": "Search text, author, or signals",
    "results.sort": "Result order",
    "results.relevance": "Active openings first",
    "results.newest": "Newest first",
    "results.oldest": "Oldest first",
    "results.previous": "Previous",
    "results.next": "Next",
    "results.page": "Page {page} · {count} results",
    "results.emptyTitle": "No posts scanned yet",
    "results.emptyDetail": "Start the monitor to detect likely hiring posts.",
    "results.emptyMonitorTitle": "No matches in this view yet",
    "results.emptyMonitorDetail": "Keep browsing. Possible or partial matches stay visible for review.",
    "results.details": "View full details",
    "results.openOriginal": "Open original post",
    "results.closeDetails": "Close details",
    "results.detailLoading": "Loading full post details…",
    "results.fullTextUnavailable": "Full text unavailable.",
    "results.authorUnavailable": "Author unavailable",
    "results.extraction": "Extraction: {status}",
    "results.postedAge": "Posted {age}",
    "results.staleNote": "Older than 60 days — may no longer be active",
    "results.partial": "Text may still be truncated; monitor will retry after expansion.",
    "results.noPreview": "No preview text available.",
    "results.lowConfidence": "Review the full post; this is a low-confidence local match.",
    "results.signals": "Signals: {signals}",
    "review.label": "Your local review",
    "review.aria": "Local review label; does not affect detection",
    "review.none": "No label",
    "review.useful": "Useful",
    "review.irrelevant": "Irrelevant",
    "review.false_positive": "False positive",
    "review.partial": "Partial",
    "export.json": "Export JSON",
    "export.csv": "Export CSV",
    "export.format": "File format",
    "export.selected": "Export selected category only",
    "export.selectedHelp": "Uses the category filter above; off exports all detections.",
    "export.fields": "Choose fields to include",
    "export.fullText": "Full post text",
    "export.emails": "Email addresses",
    "export.jobTitles": "Job-title candidates",
    "export.metrics": "Age and metrics",
    "export.metadata": "Author, links, hashtags",
    "export.matchesOnly": "Show selected matches in feed only",
    "export.matchesOnlyHelp": "While monitoring; stop to restore. Uncertain or partial posts stay visible.",
    "export.initial": "User-initiated local JSON or CSV. Choose fields and optionally export only the selected category.",
    "export.preparing": "Preparing the local {format} export…",
    "export.success": "{count} posts exported locally to {format}. No post data was uploaded.",
    "export.empty": "No detections or saved history are available to export.",
    "export.emptyCategory": "No posts match the current export category.",
    "export.failed": "The {format} export failed. Local data was not uploaded.",
    "footer.target": "Selected feed stays pinned when you switch tabs",
    "footer.local": "Local only"
  };

  const fr = {
    "app.title": "Linkerter – Flux LinkedIn adaptatif", "app.eyebrow": "OUTIL DE FLUX LINKEDIN", "app.name": "Assistant de flux",
    "locale.label": "Langue", "locale.auto": "Automatique", "locale.en": "English", "locale.fr": "Français", "locale.ar": "العربية",
    "onboarding.title": "Assistance locale, contrôlée par vous", "onboarding.body": "Linkerter fait défiler et analyse uniquement le flux sélectionné. Il ne aime pas, ne commente pas, ne se connecte pas, n’envoie pas de messages, ne téléverse aucun post et n’utilise aucun service d’IA externe.", "onboarding.control": "Vous choisissez le rythme, les limites, l’historique et les exports. Chrome peut ralentir les onglets masqués.", "onboarding.policy": "Utilisez l’extension de façon responsable et respectez les conditions de LinkedIn. Vérifiez les détections avant d’agir.", "onboarding.dismiss": "Compris",
    "target.section": "Onglet LinkedIn surveillé", "target.detail": "Choisissez un onglet de flux LinkedIn. La cible est mémorisée à la réouverture.", "target.useActive": "Utiliser l’onglet de flux actif", "target.return": "Revenir au flux",
    "tabs.scroll": "Défilement", "tabs.hiring": "Filtre de recrutement", "notice.initial": "Ouvrez le flux LinkedIn pour commencer.",
    "scroll.ready": "PRÊT", "scroll.start": "Démarrer le défilement", "scroll.pause": "Pause", "scroll.stop": "Arrêter", "scroll.resume": "Reprendre le défilement", "scroll.running": "DÉFILEMENT", "scroll.paused": "EN PAUSE", "scroll.stopped": "ARRÊTÉ", "scroll.progress": "Progression de la limite de pas", "scroll.statusReady": "Prêt à faire défiler le flux LinkedIn.", "scroll.progressDetail": "{steps} / {max} pas · {elapsed} actif",
    "pace.kicker": "DÉFILEMENT ADAPTATIF", "pace.title": "Rythme intelligent", "pace.badge": "AUTO-ADAPTATIF", "pace.modeLabel": "Mode adaptatif", "pace.description": "Le mouvement et les pauses sont adaptatifs. Le flux continue en arrière-plan ; Chrome peut ralentir les onglets masqués.", "mode.standard": "Standard adaptatif", "mode.fast": "Rapide adaptatif", "mode.super_fast": "Ultra rapide adaptatif", "mode.standardDescription": "Mouvement adaptatif équilibré avec pauses de lecture automatiques. Chrome peut ralentir les onglets masqués.", "mode.fastDescription": "Mouvement plus rapide avec attentes variables et pauses de lecture. Chrome peut ralentir les onglets masqués.", "mode.super_fastDescription": "Rythme maximal, limité à 15 minutes / 120 pas, avec pause sur saisie obligatoire.",
    "limits.kicker": "PROTECTIONS DE SESSION", "limits.title": "Limites et protections", "limits.time": "Limite de temps", "limits.steps": "Limite de pas", "limits.pauseInput": "Pause lors de ma saisie", "limits.pauseInputHelp": "Met en pause quand vous utilisez la page.", "time.minutes": "{count} minutes", "steps.count": "{count} pas",
    "detector.kicker": "DÉTECTION LOCALE", "detector.title": "Recrutement et emploi", "detector.badge": "SANS IA", "detector.copy": "L’onglet sélectionné continue le défilement et l’analyse en anglais, français et arabe en arrière-plan. Chrome peut ralentir les onglets masqués ; l’onglet doit rester ouvert.", "detector.autoExpand": "Déplier les longs posts visibles", "detector.autoExpandHelp": "Uniquement pendant la surveillance.", "detector.localNote": "Règles locales de mots et contexte uniquement. Les étiquettes sont privées et ne changent pas la détection ; aucun dictionnaire de titres, téléversement ou appel d’IA.",
    "monitor.start": "Démarrer la surveillance", "monitor.stop": "Arrêter la surveillance", "monitor.off": "Surveillance arrêtée.", "monitor.running": "Surveillance du flux · {count} cartes analysées", "monitor.stopped": "Surveillance arrêtée · {count} cartes analysées lors du dernier cycle", "monitor.domPending": "Vérification du DOM en attente.",
    "history.label": "Enregistrer les nouveaux posts", "history.off": "Désactivé — ne rien enregistrer", "history.session": "Session du navigateur uniquement", "history.persistent": "Persistant sur cet appareil", "history.help": "Désactivé par défaut. Changer de mode ne copie pas les anciens enregistrements ; les exports lisent les deux magasins.", "history.retention": "Conservation", "history.days": "{count} jours", "history.clear": "Effacer l’historique", "history.clearAll": "Effacer toutes les données locales", "history.diagnostic": "Télécharger un diagnostic anonymisé", "history.saved": "{count} posts enregistrés", "history.offStatus": "Désactivé · aucun historique enregistré.", "history.previous": "Désactivé · {count} posts précédents restent exportables jusqu’à leur suppression.", "history.activeStatus": "{store} · {count} posts · conservation de {days} jours", "history.storeSession": "Session", "history.storePersistent": "Persistant",
    "metrics.aria": "Nombre de posts détectés", "category.open_role": "Offres", "category.recruiter_search": "Recherches de recruteurs", "category.possible": "Correspondances possibles", "category.job_seeker": "Candidats / recommandations", "category.hiring_discussion": "Conseils / actualités", "category.closed": "Fermé / négatif", "category.partial": "Texte partiel", "category.none": "Aucun signal de recrutement", "category.other": "Autres liés",
    "results.kicker": "RÉSULTATS EN DIRECT", "results.title": "Posts détectés", "results.filter": "Filtrer les résultats", "results.all": "Tous les posts détectés", "results.search": "Rechercher dans les posts", "results.search.placeholder": "Rechercher texte, auteur ou signaux", "results.sort": "Ordre des résultats", "results.relevance": "Offres actives d’abord", "results.newest": "Plus récents d’abord", "results.oldest": "Plus anciens d’abord", "results.previous": "Précédent", "results.next": "Suivant", "results.page": "Page {page} · {count} résultats", "results.emptyTitle": "Aucun post analysé", "results.emptyDetail": "Démarrez la surveillance pour détecter les posts.", "results.emptyMonitorTitle": "Aucune correspondance dans cette vue", "results.emptyMonitorDetail": "Continuez à parcourir. Les posts incertains ou partiels restent visibles.", "results.details": "Voir tous les détails", "results.openOriginal": "Ouvrir le post original", "results.closeDetails": "Fermer les détails", "results.detailLoading": "Chargement des détails…", "results.fullTextUnavailable": "Texte intégral indisponible.", "results.authorUnavailable": "Auteur indisponible", "results.extraction": "Extraction : {status}", "results.postedAge": "Publié {age}", "results.staleNote": "Plus de 60 jours — peut-être déjà pourvu", "results.partial": "Le texte peut être tronqué ; une nouvelle tentative suivra le dépliage.", "results.noPreview": "Aucun aperçu disponible.", "results.lowConfidence": "Vérifiez le post complet ; correspondance locale peu fiable.", "results.signals": "Signaux : {signals}",
    "review.label": "Votre revue locale", "review.aria": "Étiquette locale ; ne modifie pas la détection", "review.none": "Aucune étiquette", "review.useful": "Utile", "review.irrelevant": "Non pertinent", "review.false_positive": "Faux positif", "review.partial": "Partiel",
    "export.json": "Exporter en JSON", "export.csv": "Exporter en CSV", "export.format": "Format de fichier", "export.selected": "Exporter la catégorie sélectionnée uniquement", "export.selectedHelp": "Utilise le filtre ci-dessus ; désactivé pour tout exporter.", "export.fields": "Choisir les champs à inclure", "export.fullText": "Texte intégral du post", "export.emails": "Adresses e-mail", "export.jobTitles": "Candidats de titres de poste", "export.metrics": "Âge et métriques", "export.metadata": "Auteur, liens, hashtags", "export.matchesOnly": "Afficher uniquement les correspondances dans le flux", "export.matchesOnlyHelp": "Pendant la surveillance ; arrêtez pour restaurer. Les posts incertains ou partiels restent visibles.", "export.initial": "Téléchargement local JSON ou CSV à votre demande. Choisissez les champs et la catégorie.", "export.preparing": "Préparation de l’export local {format}…", "export.success": "{count} posts exportés localement en {format}. Aucune donnée téléversée.", "export.empty": "Aucune détection ni historique à exporter.", "export.emptyCategory": "Aucun post ne correspond à cette catégorie.", "export.failed": "Échec de l’export {format}. Aucune donnée locale téléversée.",
    "footer.target": "Le flux sélectionné reste associé lorsque vous changez d’onglet", "footer.local": "Local uniquement"
  };

  const ar = {
    "app.title": "Linkerter – خلاصة LinkedIn التكيّفية", "app.eyebrow": "أداة خلاصة LINKEDIN", "app.name": "مساعد الخلاصة",
    "locale.label": "اللغة", "locale.auto": "تلقائي", "locale.en": "English", "locale.fr": "Français", "locale.ar": "العربية",
    "onboarding.title": "مساعدة محلية تحت سيطرتك", "onboarding.body": "يعمل Linkerter على تمرير وتحليل الخلاصة المحددة محلياً فقط. لا يعجب أو يعلق أو يتصل أو يراسل أو يرفع المنشورات أو يستخدم خدمة ذكاء اصطناعي خارجية.", "onboarding.control": "أنت تختار السرعة والحدود ووضع السجل وعمليات التصدير. قد يبطئ Chrome العمل في علامات التبويب المخفية.", "onboarding.policy": "استخدم الإضافة بمسؤولية واتبع شروط LinkedIn المعمول بها. راجع النتائج قبل التصرف بناءً عليها.", "onboarding.dismiss": "فهمت",
    "target.section": "علامة تبويب LinkedIn المراقبة", "target.detail": "اختر علامة تبويب خلاصة LinkedIn. يُحفظ الهدف عند إعادة فتح النافذة.", "target.useActive": "استخدام علامة الخلاصة النشطة", "target.return": "العودة إلى الخلاصة",
    "tabs.scroll": "التمرير", "tabs.hiring": "مرشح التوظيف", "notice.initial": "افتح خلاصة LinkedIn للبدء.",
    "scroll.ready": "جاهز", "scroll.start": "بدء التمرير", "scroll.pause": "إيقاف مؤقت", "scroll.stop": "إيقاف", "scroll.resume": "استئناف التمرير", "scroll.running": "جارٍ التمرير", "scroll.paused": "متوقف مؤقتاً", "scroll.stopped": "متوقف", "scroll.progress": "تقدم حد خطوات التمرير", "scroll.statusReady": "جاهز لتمرير خلاصة LinkedIn.", "scroll.progressDetail": "{steps} / {max} خطوة · {elapsed} نشط",
    "pace.kicker": "التمرير التكيّفي", "pace.title": "إيقاع ذكي", "pace.badge": "تكيّف تلقائي", "pace.modeLabel": "الوضع التكيّفي", "pace.description": "الحركة وفترات التوقف تكيّفية. يستمر تمرير الخلاصة في الخلفية؛ وقد يبطئ Chrome علامات التبويب المخفية.", "mode.standard": "قياسي تكيّفي", "mode.fast": "سريع تكيّفي", "mode.super_fast": "فائق السرعة التكيّفي", "mode.standardDescription": "حركة تكيّفية متوازنة مع فترات قراءة تلقائية. قد يبطئ Chrome علامات التبويب المخفية.", "mode.fastDescription": "حركة أسرع مع انتظار متغير وفترات قراءة مدمجة. قد يبطئ Chrome علامات التبويب المخفية.", "mode.super_fastDescription": "أعلى إيقاع تكيّفي، بحد أقصى 15 دقيقة / 120 خطوة، مع تفعيل التوقف عند الإدخال دائماً.",
    "limits.kicker": "ضمانات الجلسة", "limits.title": "الحدود والضمانات", "limits.time": "الحد الزمني", "limits.steps": "حد الخطوات", "limits.pauseInput": "التوقف عند إدخالي", "limits.pauseInputHelp": "يتوقف عند استخدامك للصفحة.", "time.minutes": "{count} دقائق", "steps.count": "{count} خطوة",
    "detector.kicker": "الكشف المحلي", "detector.title": "التوظيف والعمل", "detector.badge": "بدون ذكاء اصطناعي", "detector.copy": "تستمر علامة التبويب المحددة في التمرير وتحليل المنشورات محلياً بالإنجليزية والفرنسية والعربية في الخلفية. قد يبطئ Chrome علامات التبويب المخفية، ويجب أن تبقى الخلاصة مفتوحة.", "detector.autoExpand": "توسيع المنشورات الطويلة المرئية تلقائياً", "detector.autoExpandHelp": "فقط أثناء تشغيل مراقبة التوظيف.", "detector.localNote": "قواعد محلية للكلمات والسياق فقط. ملاحظات المراجعة خاصة ولا تغير الكشف؛ لا قاموس للمسميات ولا رفع ولا استدعاءات ذكاء اصطناعي.",
    "monitor.start": "بدء مراقبة التوظيف", "monitor.stop": "إيقاف مراقبة التوظيف", "monitor.off": "المراقبة متوقفة.", "monitor.running": "مراقبة الخلاصة · تم فحص {count} بطاقة", "monitor.stopped": "المراقبة متوقفة · تم فحص {count} بطاقة في الجولة الأخيرة", "monitor.domPending": "فحص DOM معلق.",
    "history.label": "حفظ المنشورات الجديدة", "history.off": "إيقاف — لا تحفظ منشورات جديدة", "history.session": "جلسة المتصفح فقط", "history.persistent": "دائم على هذا الجهاز", "history.help": "متوقف افتراضياً. تغيير الوضع لا ينسخ السجلات القديمة؛ ويمكن للتصدير قراءة المخزنين.", "history.retention": "مدة الاحتفاظ", "history.days": "{count} أيام", "history.clear": "مسح السجل المحفوظ", "history.clearAll": "مسح جميع البيانات المحلية", "history.diagnostic": "تنزيل تشخيص منقّح", "history.saved": "{count} منشورات محفوظة", "history.offStatus": "متوقف · لا يُحفظ سجل منشورات.", "history.previous": "متوقف · تبقى {count} منشورات سابقة قابلة للتصدير حتى مسحها.", "history.activeStatus": "{store} · {count} منشورات · الاحتفاظ {days} يوماً", "history.storeSession": "الجلسة", "history.storePersistent": "دائم",
    "metrics.aria": "أعداد المنشورات المكتشفة", "category.open_role": "وظائف شاغرة", "category.recruiter_search": "عمليات بحث القائمين بالتوظيف", "category.possible": "تطابقات محتملة", "category.job_seeker": "الباحثون عن عمل / الإحالات", "category.hiring_discussion": "نصائح / أخبار التوظيف", "category.closed": "مغلق / سلبي", "category.partial": "نص جزئي", "category.none": "لا توجد إشارة توظيف", "category.other": "أخرى ذات صلة",
    "results.kicker": "النتائج المباشرة", "results.title": "المنشورات المكتشفة", "results.filter": "تصفية النتائج", "results.all": "كل المكتشف", "results.search": "البحث في المنشورات", "results.search.placeholder": "ابحث في النص أو المؤلف أو الإشارات", "results.sort": "ترتيب النتائج", "results.relevance": "الوظائف الشاغرة النشطة أولاً", "results.newest": "الأحدث أولاً", "results.oldest": "الأقدم أولاً", "results.previous": "السابق", "results.next": "التالي", "results.page": "صفحة {page} · {count} نتيجة", "results.emptyTitle": "لم تُفحص منشورات بعد", "results.emptyDetail": "ابدأ المراقبة لاكتشاف منشورات التوظيف المحتملة.", "results.emptyMonitorTitle": "لا تطابقات في هذا العرض", "results.emptyMonitorDetail": "تابع التصفح. تبقى المنشورات غير المؤكدة أو الجزئية مرئية للمراجعة.", "results.details": "عرض التفاصيل الكاملة", "results.openOriginal": "فتح المنشور الأصلي", "results.closeDetails": "إغلاق التفاصيل", "results.detailLoading": "جارٍ تحميل تفاصيل المنشور…", "results.fullTextUnavailable": "النص الكامل غير متاح.", "results.authorUnavailable": "المؤلف غير متاح", "results.extraction": "الاستخراج: {status}", "results.postedAge": "نُشر {age}", "results.staleNote": "أقدم من 60 يوماً — قد لم تعد شاغرة", "results.partial": "قد يكون النص مقتطعاً؛ ستعيد المراقبة المحاولة بعد التوسيع.", "results.noPreview": "لا توجد معاينة متاحة.", "results.lowConfidence": "راجع المنشور كاملاً؛ هذا تطابق محلي منخفض الثقة.", "results.signals": "الإشارات: {signals}",
    "review.label": "مراجعتك المحلية", "review.aria": "تسمية مراجعة محلية؛ لا تؤثر في الكشف", "review.none": "بلا تسمية", "review.useful": "مفيد", "review.irrelevant": "غير ذي صلة", "review.false_positive": "إيجابي خاطئ", "review.partial": "جزئي",
    "export.json": "تصدير JSON", "export.csv": "تصدير CSV", "export.format": "تنسيق الملف", "export.selected": "تصدير الفئة المحددة فقط", "export.selectedHelp": "يستخدم مرشح الفئة أعلاه؛ أوقفه لتصدير الكل.", "export.fields": "اختيار الحقول المضمّنة", "export.fullText": "نص المنشور الكامل", "export.emails": "عناوين البريد الإلكتروني", "export.jobTitles": "المسميات الوظيفية المرشحة", "export.metrics": "العمر والمقاييس", "export.metadata": "المؤلف والروابط والوسوم", "export.matchesOnly": "إظهار التطابقات المحددة في الخلاصة فقط", "export.matchesOnlyHelp": "أثناء المراقبة؛ أوقفها للاستعادة. تبقى المنشورات غير المؤكدة أو الجزئية مرئية.", "export.initial": "تنزيل JSON أو CSV محلياً بطلب منك. اختر الحقول والفئة اختيارياً.", "export.preparing": "جارٍ تجهيز تصدير {format} المحلي…", "export.success": "تم تصدير {count} منشورات محلياً إلى {format}. لم تُرفع بيانات المنشورات.", "export.empty": "لا توجد اكتشافات أو سجل متاح للتصدير.", "export.emptyCategory": "لا توجد منشورات تطابق فئة التصدير الحالية.", "export.failed": "فشل تصدير {format}. لم تُرفع البيانات المحلية.",
    "footer.target": "تبقى الخلاصة المحددة مرتبطة عند تبديل علامات التبويب", "footer.local": "محلي فقط"
  };

  Object.assign(en, {
    "tabs.section": "Extension sections", "scroll.controls": "Scrolling controls", "pace.smart": "SMART ALGORITHM", "pace.locked": "LOCKED GUARDRAILS", "monitor.duplicates": "{count} duplicate cards merged", "results.author": "Author: {name}", "results.unavailable": "unavailable", "results.metrics": "Reactions: {reactions} · Comments: {comments} · Reposts: {reposts} · Views: {views}",
    "connection.checking": "CHECKING", "connection.offline": "NOT CONNECTED", "connection.openFeed": "OPEN FEED", "connection.background": "FEED BACKGROUND", "connection.feed": "LINKEDIN FEED",
    "target.noFeed": "NO FEED SELECTED", "target.active": "FEED TAB ACTIVE", "target.background": "FEED TAB IN BACKGROUND", "target.selected": "This tab is selected. Scrolling and local gathering are available.", "target.backgroundDetail": "Scrolling and gathering continue in the background. Chrome may throttle hidden tabs; return here to interact.",
    "notice.selectFeed": "Select an open LinkedIn feed tab to use the popup.", "notice.refreshFeed": "Refresh this LinkedIn feed tab so the extension scripts can load.", "notice.unavailable": "The selected feed tab is unavailable. Refresh LinkedIn or select another feed.", "notice.leftFeed": "The selected tab left the LinkedIn feed; monitoring has ended.", "notice.closed": "The selected LinkedIn tab closed; live monitoring has ended.",
    "results.processedInitial": "Start the monitor to scan posts as you browse.", "detail.notFound": "That post is no longer available in the current run.",
    "review.saved": "Review label saved locally; detection signals were not changed.", "review.failed": "Could not save the review label locally.",
    "clear.historyConfirm": "Delete all saved post history from this device? Current detections and review labels will be kept. This cannot be undone.", "clear.allConfirm": "Delete ALL Linkerter data on this device, including history, review labels, settings, target choices, and diagnostics? This cannot be undone.", "clear.historyDone": "Local post history cleared; no post data was uploaded.", "clear.allDone": "All local data cleared; no data was uploaded.", "clear.failed": "Could not clear local data. Storage reported an error; no deletion was assumed.",
    "diagnostic.success": "Sanitized diagnostic created locally; no data was uploaded.", "diagnostic.failed": "Could not create the local diagnostic.",
    "monitor.restartConfirm": "This run contains {count} unexported posts. Export first to keep them, or continue to start a new run and replace the current archive. Continue?"
  });
  Object.assign(fr, {
    "tabs.section": "Sections de l’extension", "scroll.controls": "Commandes de défilement", "pace.smart": "ALGORITHME INTELLIGENT", "pace.locked": "PROTECTIONS VERROUILLÉES", "monitor.duplicates": "{count} cartes en double fusionnées", "results.author": "Auteur : {name}", "results.unavailable": "indisponible", "results.metrics": "Réactions : {reactions} · Commentaires : {comments} · Republications : {reposts} · Vues : {views}",
    "connection.checking": "VÉRIFICATION", "connection.offline": "NON CONNECTÉ", "connection.openFeed": "OUVRIR LE FLUX", "connection.background": "FLUX EN ARRIÈRE-PLAN", "connection.feed": "FLUX LINKEDIN",
    "target.noFeed": "AUCUN FLUX SÉLECTIONNÉ", "target.active": "ONGLET DE FLUX ACTIF", "target.background": "FLUX EN ARRIÈRE-PLAN", "target.selected": "Cet onglet est sélectionné. Le défilement et la collecte locale sont disponibles.", "target.backgroundDetail": "Le défilement et la collecte continuent en arrière-plan. Chrome peut ralentir les onglets masqués.",
    "notice.selectFeed": "Sélectionnez un onglet de flux LinkedIn ouvert.", "notice.refreshFeed": "Actualisez cet onglet LinkedIn pour charger les scripts de l’extension.", "notice.unavailable": "L’onglet sélectionné est indisponible. Actualisez LinkedIn ou choisissez un autre flux.", "notice.leftFeed": "L’onglet a quitté le flux LinkedIn ; la surveillance est terminée.", "notice.closed": "L’onglet LinkedIn sélectionné est fermé ; la surveillance est terminée.",
    "results.processedInitial": "Démarrez la surveillance pour analyser les posts.", "detail.notFound": "Ce post n’est plus disponible dans le cycle actuel.",
    "review.saved": "Étiquette enregistrée localement ; les signaux de détection sont inchangés.", "review.failed": "Impossible d’enregistrer l’étiquette localement.",
    "clear.historyConfirm": "Supprimer tout l’historique des posts sur cet appareil ? Les détections actuelles et les étiquettes seront conservées. Action irréversible.", "clear.allConfirm": "Supprimer TOUTES les données Linkerter sur cet appareil, y compris historique, étiquettes, réglages, cibles et diagnostics ? Action irréversible.", "clear.historyDone": "Historique local effacé ; aucune donnée téléversée.", "clear.allDone": "Toutes les données locales sont effacées ; aucune donnée téléversée.", "clear.failed": "Impossible d’effacer les données. Le stockage a signalé une erreur ; aucune suppression n’est présumée.",
    "diagnostic.success": "Diagnostic anonymisé créé localement ; aucune donnée téléversée.", "diagnostic.failed": "Impossible de créer le diagnostic local.",
    "monitor.restartConfirm": "Ce cycle contient {count} posts non exportés. Exportez-les d’abord pour les conserver, ou continuez pour démarrer un nouveau cycle et remplacer l’archive. Continuer ?"
  });
  Object.assign(ar, {
    "tabs.section": "أقسام الإضافة", "scroll.controls": "عناصر التحكم في التمرير", "pace.smart": "خوارزمية ذكية", "pace.locked": "ضمانات مقفلة", "monitor.duplicates": "تم دمج {count} بطاقات مكررة", "results.author": "المؤلف: {name}", "results.unavailable": "غير متاح", "results.metrics": "التفاعلات: {reactions} · التعليقات: {comments} · إعادات النشر: {reposts} · المشاهدات: {views}",
    "connection.checking": "جارٍ الفحص", "connection.offline": "غير متصل", "connection.openFeed": "افتح الخلاصة", "connection.background": "الخلاصة في الخلفية", "connection.feed": "خلاصة LINKEDIN",
    "target.noFeed": "لم تُحدد خلاصة", "target.active": "علامة الخلاصة نشطة", "target.background": "علامة الخلاصة في الخلفية", "target.selected": "علامة التبويب هذه محددة. التمرير والجمع المحلي متاحان.", "target.backgroundDetail": "يستمر التمرير والجمع في الخلفية. قد يبطئ Chrome علامات التبويب المخفية؛ عد هنا للتفاعل.",
    "notice.selectFeed": "حدد علامة تبويب خلاصة LinkedIn مفتوحة لاستخدام النافذة.", "notice.refreshFeed": "حدّث علامة تبويب LinkedIn هذه لتحميل برامج الإضافة.", "notice.unavailable": "علامة الخلاصة المحددة غير متاحة. حدّث LinkedIn أو اختر خلاصة أخرى.", "notice.leftFeed": "غادرت علامة التبويب خلاصة LinkedIn؛ انتهت المراقبة.", "notice.closed": "أُغلقت علامة LinkedIn المحددة؛ انتهت المراقبة المباشرة.",
    "results.processedInitial": "ابدأ المراقبة لفحص المنشورات أثناء التصفح.", "detail.notFound": "لم يعد هذا المنشور متاحاً في الجولة الحالية.",
    "review.saved": "حُفظت تسمية المراجعة محلياً؛ لم تتغير إشارات الكشف.", "review.failed": "تعذر حفظ تسمية المراجعة محلياً.",
    "clear.historyConfirm": "حذف كل سجل المنشورات المحفوظ من هذا الجهاز؟ ستبقى الاكتشافات الحالية وتسميات المراجعة. لا يمكن التراجع.", "clear.allConfirm": "حذف جميع بيانات Linkerter من هذا الجهاز، بما فيها السجل والتسميات والإعدادات والأهداف والتشخيصات؟ لا يمكن التراجع.", "clear.historyDone": "مُسح سجل المنشورات المحلي؛ لم تُرفع بيانات.", "clear.allDone": "مُسحت جميع البيانات المحلية؛ لم تُرفع بيانات.", "clear.failed": "تعذر مسح البيانات المحلية. أبلغ التخزين عن خطأ؛ لم يُفترض الحذف.",
    "diagnostic.success": "أُنشئ تشخيص منقّح محلياً؛ لم تُرفع بيانات.", "diagnostic.failed": "تعذر إنشاء التشخيص المحلي.",
    "monitor.restartConfirm": "تحتوي هذه الجولة على {count} منشورات غير مصدّرة. صدّرها أولاً للاحتفاظ بها، أو تابع لبدء جولة جديدة واستبدال الأرشيف الحالي. هل تتابع؟"
  });

  Object.assign(en, {
    "settings.saveFailed": "Could not save settings.",
    "history.usage": "{bytes} B used", "history.lastSave": "Last successful save: {time}", "history.noSave": "No successful save recorded", "history.unavailable": "History storage is unavailable; existing data could not be read.",
    "notice.switchFeed": "Switch to a LinkedIn feed tab, then select it here.", "notice.openFeedExact": "Open linkedin.com/feed/ in this tab before selecting it.", "notice.selected": "LinkedIn feed selected. The target remains remembered when you reopen the popup.", "notice.returned": "Returned to the selected LinkedIn feed tab.", "notice.closedChoose": "The selected feed tab was closed. Choose another LinkedIn feed.",
    "target.selectBegin": "Select a LinkedIn feed tab to begin.", "target.monitorSelect": "Select a LinkedIn feed tab to monitor.", "target.scanSelect": "Select a feed tab to scan posts.",
    "scroll.starting": "Starting the feed scroller…", "scroll.background": "Scrolling the selected feed in the background; Chrome may throttle it.", "scroll.active": "Scrolling the selected LinkedIn feed tab.", "scroll.pausedNotice": "Scroll paused.", "scroll.restart": "You can start another run when ready.", "scroll.choosePace": "Choose a pace, then start scrolling.",
    "monitor.domChecking": "Checking LinkedIn feed selectors…", "monitor.domStopped": "Feed DOM check runs when monitoring starts.", "monitor.hidden": " Hidden tab: scrolling and gathering continue; Chrome may throttle them.",
    "results.range": "Showing {start}–{end} of {count} · Page {page}", "results.age": "Post age: {age}",
    "results.processedRunning": "{checked} cards checked · {archive} unique detected posts · newest detections first", "results.processedStopped": "{count} cards checked · restart the monitor to scan again",
    "export.availableStopped": "{count} current-run posts available locally. Choose format, fields, and category above.", "export.availableWithHistory": "{count} current-run posts · {history} saved-history posts available locally. Choose format, fields, and category above.", "export.capSuffix": "Current archive cap reached.", "export.availableRunning": "Detected posts will be available for local download. Choose JSON or CSV and select fields above.", "export.noneYet": "No detections or saved history to export yet. Review labels stay local and do not change detection.",
    "clear.historyDetail": "Saved post history cleared from both session and persistent storage. Review labels were kept.",
    "confidence.strong": "Strong", "confidence.likely": "Likely", "confidence.low": "Low", "confidence.review": "Review", "extraction.complete": "complete", "extraction.partial": "partial"
  });
  Object.assign(fr, {
    "settings.saveFailed": "Impossible d’enregistrer les réglages.",
    "history.usage": "{bytes} o utilisés", "history.lastSave": "Dernier enregistrement réussi : {time}", "history.noSave": "Aucun enregistrement réussi", "history.unavailable": "Stockage de l’historique indisponible ; les données existantes n’ont pas pu être lues.",
    "notice.switchFeed": "Passez à un onglet de flux LinkedIn, puis sélectionnez-le ici.", "notice.openFeedExact": "Ouvrez linkedin.com/feed/ dans cet onglet avant de le sélectionner.", "notice.selected": "Flux LinkedIn sélectionné. La cible sera mémorisée à la réouverture.", "notice.returned": "Retour à l’onglet de flux LinkedIn sélectionné.", "notice.closedChoose": "L’onglet de flux sélectionné a été fermé. Choisissez un autre flux LinkedIn.",
    "target.selectBegin": "Sélectionnez un onglet de flux LinkedIn pour commencer.", "target.monitorSelect": "Sélectionnez un onglet de flux LinkedIn à surveiller.", "target.scanSelect": "Sélectionnez un onglet de flux pour analyser les posts.",
    "scroll.starting": "Démarrage du défilement…", "scroll.background": "Défilement du flux sélectionné en arrière-plan ; Chrome peut le ralentir.", "scroll.active": "Défilement de l’onglet de flux LinkedIn sélectionné.", "scroll.pausedNotice": "Défilement en pause.", "scroll.restart": "Vous pouvez lancer un autre cycle quand vous êtes prêt.", "scroll.choosePace": "Choisissez un rythme, puis démarrez le défilement.",
    "monitor.domChecking": "Vérification des sélecteurs du flux LinkedIn…", "monitor.domStopped": "La vérification du DOM démarre avec la surveillance.", "monitor.hidden": " Onglet masqué : le défilement et la collecte continuent ; Chrome peut les ralentir.",
    "results.range": "Affichage de {start}–{end} sur {count} · Page {page}", "results.age": "Âge du post : {age}",
    "results.processedRunning": "{checked} cartes vérifiées · {archive} posts uniques détectés · plus récents d’abord", "results.processedStopped": "{count} cartes vérifiées · redémarrez la surveillance pour analyser à nouveau",
    "export.availableStopped": "{count} posts du cycle actuel disponibles localement. Choisissez le format, les champs et la catégorie ci-dessus.", "export.availableWithHistory": "{count} posts du cycle actuel · {history} posts d’historique disponibles localement. Choisissez le format, les champs et la catégorie ci-dessus.", "export.capSuffix": "La limite de l’archive actuelle est atteinte.", "export.availableRunning": "Les posts détectés seront disponibles au téléchargement local. Choisissez JSON ou CSV et les champs ci-dessus.", "export.noneYet": "Aucune détection ni historique à exporter. Les étiquettes restent locales et ne changent pas la détection.",
    "clear.historyDetail": "Historique effacé des stockages de session et persistant. Les étiquettes de revue ont été conservées.",
    "confidence.strong": "Forte", "confidence.likely": "Probable", "confidence.low": "Faible", "confidence.review": "À vérifier", "extraction.complete": "complet", "extraction.partial": "partiel"
  });
  Object.assign(ar, {
    "settings.saveFailed": "تعذر حفظ الإعدادات.",
    "history.usage": "{bytes} بايت مستخدمة", "history.lastSave": "آخر حفظ ناجح: {time}", "history.noSave": "لا يوجد حفظ ناجح مسجل", "history.unavailable": "تخزين السجل غير متاح؛ تعذرت قراءة البيانات الموجودة.",
    "notice.switchFeed": "انتقل إلى علامة تبويب خلاصة LinkedIn، ثم حددها هنا.", "notice.openFeedExact": "افتح linkedin.com/feed/ في علامة التبويب هذه قبل تحديدها.", "notice.selected": "تم تحديد خلاصة LinkedIn. سيُحفظ الهدف عند إعادة فتح النافذة.", "notice.returned": "تمت العودة إلى علامة تبويب خلاصة LinkedIn المحددة.", "notice.closedChoose": "أُغلقت علامة الخلاصة المحددة. اختر خلاصة LinkedIn أخرى.",
    "target.selectBegin": "حدد علامة تبويب خلاصة LinkedIn للبدء.", "target.monitorSelect": "حدد علامة تبويب خلاصة LinkedIn لمراقبتها.", "target.scanSelect": "حدد علامة تبويب خلاصة لفحص المنشورات.",
    "scroll.starting": "جارٍ بدء أداة تمرير الخلاصة…", "scroll.background": "يجري تمرير الخلاصة المحددة في الخلفية؛ وقد يبطئها Chrome.", "scroll.active": "يجري تمرير علامة تبويب خلاصة LinkedIn المحددة.", "scroll.pausedNotice": "التمرير متوقف مؤقتاً.", "scroll.restart": "يمكنك بدء جولة أخرى عندما تكون مستعداً.", "scroll.choosePace": "اختر الإيقاع، ثم ابدأ التمرير.",
    "monitor.domChecking": "جارٍ فحص محددات خلاصة LinkedIn…", "monitor.domStopped": "يبدأ فحص DOM للخلاصة عند تشغيل المراقبة.", "monitor.hidden": " علامة تبويب مخفية: يستمر التمرير والجمع؛ وقد يبطئهما Chrome.",
    "results.range": "عرض {start}–{end} من {count} · صفحة {page}", "results.age": "عمر المنشور: {age}",
    "results.processedRunning": "تم فحص {checked} بطاقات · {archive} منشورات فريدة مكتشفة · الأحدث أولاً", "results.processedStopped": "تم فحص {count} بطاقات · أعد تشغيل المراقبة للفحص مجدداً",
    "export.availableStopped": "{count} منشورات من الجولة الحالية متاحة محلياً. اختر التنسيق والحقول والفئة أعلاه.", "export.availableWithHistory": "{count} منشورات حالية · {history} منشورات محفوظة متاحة محلياً. اختر التنسيق والحقول والفئة أعلاه.", "export.capSuffix": "تم بلوغ حد الأرشيف الحالي.", "export.availableRunning": "ستتاح المنشورات المكتشفة للتنزيل المحلي. اختر JSON أو CSV والحقول أعلاه.", "export.noneYet": "لا توجد اكتشافات أو سجل للتصدير بعد. تبقى تسميات المراجعة محلية ولا تغير الكشف.",
    "clear.historyDetail": "مُسح سجل المنشورات من تخزين الجلسة والتخزين الدائم. وتم الاحتفاظ بتسميات المراجعة.",
    "confidence.strong": "قوية", "confidence.likely": "محتملة", "confidence.low": "منخفضة", "confidence.review": "للمراجعة", "extraction.complete": "كامل", "extraction.partial": "جزئي"
  });

  const dictionaries = { en, fr, ar };
  let currentLocale = "en";

  function detectLocale() {
    const language = String(globalThis.navigator?.language || "en").toLowerCase();
    if (language.startsWith("fr")) return "fr";
    if (language.startsWith("ar")) return "ar";
    return "en";
  }

  function setLocale(requested) {
    currentLocale = requested === "auto" ? detectLocale() : Object.hasOwn(dictionaries, requested) ? requested : "en";
    return currentLocale;
  }

  function t(key, substitutions = {}) {
    const template = dictionaries[currentLocale][key] ?? dictionaries.en[key] ?? key;
    return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
      Object.hasOwn(substitutions, name) ? String(substitutions[name]) : match);
  }

  function applyLocale(root = globalThis.document) {
    if (!root) return;
    if (root.documentElement) {
      root.documentElement.lang = currentLocale;
      root.documentElement.dir = currentLocale === "ar" ? "rtl" : "ltr";
      if (root.title !== undefined) root.title = t("app.title");
    }
    const variables = (node) => node.hasAttribute("data-i18n-count") ? { count: node.getAttribute("data-i18n-count") } : {};
    root.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.getAttribute("data-i18n"), variables(node)); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((node) => { node.setAttribute("placeholder", t(node.getAttribute("data-i18n-placeholder"), variables(node))); });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((node) => { node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria-label"), variables(node))); });
    root.querySelectorAll("[data-i18n-title]").forEach((node) => { node.setAttribute("title", t(node.getAttribute("data-i18n-title"), variables(node))); });
  }

  const api = { dictionaries, setLocale, t, applyLocale };
  Object.defineProperties(api, {
    locale: { get: () => currentLocale },
    direction: { get: () => currentLocale === "ar" ? "rtl" : "ltr" }
  });
  globalThis.__LI_FEED_I18N__ = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
