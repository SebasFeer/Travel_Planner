// ============================================================
// i18n.js — Idioma de la app: detección automática del idioma del
// dispositivo, selector manual en Ajustes, y las traducciones.
//
// Alcance honesto: esto traduce toda la "carcasa" de la app —
// navegación, inicio, bienvenida, ajustes, títulos de sección,
// estados vacíos, tarjetas del resumen del viaje, botones comunes
// (Guardar/Cancelar/Cerrar/Editar/Eliminar) — que es lo que se ve
// en todo momento sin importar en qué viaje/sección estés. Los
// campos de cada formulario (añadir vuelo, hotel, gasto...), el
// copiloto IA, el estado de vuelos y el texto legal de privacidad
// siguen solo en español por ahora — traducirlos también es un
// trabajo mucho más grande, para una siguiente pasada.
// ============================================================

import { Data } from "./db.js";

const LANG_KEY = "app_lang";

const LANGUAGES = {
  es: { name: "Español", dir: "ltr" },
  en: { name: "English", dir: "ltr" },
  pt: { name: "Português", dir: "ltr" },
  zh: { name: "中文", dir: "ltr" },
  ar: { name: "العربية", dir: "rtl" },
};

const SUPPORTED = Object.keys(LANGUAGES);

const T = {
  // ---------- Comunes ----------
  common_save: { es: "Guardar", en: "Save", pt: "Guardar", zh: "保存", ar: "حفظ" },
  common_cancel: { es: "Cancelar", en: "Cancel", pt: "Cancelar", zh: "取消", ar: "إلغاء" },
  common_close: { es: "Cerrar", en: "Close", pt: "Fechar", zh: "关闭", ar: "إغلاق" },
  common_edit: { es: "Editar", en: "Edit", pt: "Editar", zh: "编辑", ar: "تعديل" },
  common_delete: { es: "Eliminar", en: "Delete", pt: "Eliminar", zh: "删除", ar: "حذف" },
  common_confirm: { es: "Confirmar", en: "Confirm", pt: "Confirmar", zh: "确认", ar: "تأكيد" },
  common_accept: { es: "Aceptar", en: "Accept", pt: "Aceitar", zh: "确定", ar: "قبول" },

  // ---------- Navegación ----------
  nav_home: { es: "Inicio", en: "Home", pt: "Início", zh: "首页", ar: "الرئيسية" },
  nav_trips: { es: "Viajes", en: "Trips", pt: "Viagens", zh: "行程", ar: "الرحلات" },
  nav_add: { es: "Añadir", en: "Add", pt: "Adicionar", zh: "添加", ar: "إضافة" },
  nav_map: { es: "Mapa", en: "Map", pt: "Mapa", zh: "地图", ar: "الخريطة" },
  nav_more: { es: "Más", en: "More", pt: "Mais", zh: "更多", ar: "المزيد" },
  nav_itinerary: { es: "Itinerario", en: "Itinerary", pt: "Itinerário", zh: "行程安排", ar: "خط السير" },
  nav_expenses: { es: "Gastos", en: "Expenses", pt: "Despesas", zh: "支出", ar: "المصاريف" },

  // ---------- Inicio ----------
  greet_morning: { es: "Buenos días", en: "Good morning", pt: "Bom dia", zh: "早上好", ar: "صباح الخير" },
  greet_afternoon: { es: "Buenas tardes", en: "Good afternoon", pt: "Boa tarde", zh: "下午好", ar: "مساء الخير" },
  greet_night: { es: "Buenas noches", en: "Good evening", pt: "Boa noite", zh: "晚上好", ar: "مساء الخير" },
  greet_question: { es: "¿A dónde te llevamos hoy?", en: "Where shall we take you today?", pt: "Para onde vamos hoje?", zh: "今天我们去哪儿？", ar: "إلى أين نأخذك اليوم؟" },
  search_placeholder: {
    es: "Busca un destino: hoteles y lugares al momento…",
    en: "Search a destination: hotels and places instantly…",
    pt: "Pesquise um destino: hotéis e lugares na hora…",
    zh: "搜索目的地：酒店和景点即时查询…",
    ar: "ابحث عن وجهة: فنادق وأماكن فوراً…",
  },
  ai_plan_title: { es: "Planificar viaje con IA", en: "Plan a trip with AI", pt: "Planejar viagem com IA", zh: "用 AI 规划旅行", ar: "خطّط رحلة بالذكاء الاصطناعي" },
  ai_plan_subtitle: {
    es: "Dinos el destino y tus gustos, y te armamos el itinerario",
    en: "Tell us the destination and your tastes, and we'll build the itinerary",
    pt: "Diga-nos o destino e seus gostos, e montamos o itinerário",
    zh: "告诉我们目的地和喜好，我们为你安排行程",
    ar: "أخبرنا بالوجهة وأذواقك، وسننشئ لك خط السير",
  },
  new_trip: { es: "＋ Nuevo viaje", en: "＋ New trip", pt: "＋ Nova viagem", zh: "＋ 新建行程", ar: "＋ رحلة جديدة" },
  my_trips: { es: "Mis viajes", en: "My trips", pt: "Minhas viagens", zh: "我的行程", ar: "رحلاتي" },
  see_all: { es: "Ver todos", en: "See all", pt: "Ver todos", zh: "查看全部", ar: "عرض الكل" },
  upcoming_events: { es: "Próximos eventos", en: "Upcoming events", pt: "Próximos eventos", zh: "近期日程", ar: "الأحداث القادمة" },
  no_upcoming_events: { es: "No hay próximos eventos.", en: "No upcoming events.", pt: "Nenhum evento próximo.", zh: "暂无近期日程。", ar: "لا توجد أحداث قادمة." },
  empty_trips_line1: { es: "Todavía no tienes ningún viaje.", en: "You don't have any trips yet.", pt: "Você ainda não tem nenhuma viagem.", zh: "你还没有任何行程。", ar: "ليس لديك أي رحلات بعد." },
  empty_trips_line2: {
    es: 'Toca "Nuevo viaje" para crear el primero.',
    en: 'Tap "New trip" to create your first one.',
    pt: 'Toque em "Nova viagem" para criar a primeira.',
    zh: '点击"新建行程"创建你的第一个行程。',
    ar: 'اضغط على "رحلة جديدة" لإنشاء أول رحلة لك.',
  },

  // ---------- Arranque / bienvenida ----------
  boot_loading: { es: "Cargando TravelPlanner…", en: "Loading TravelPlanner…", pt: "Carregando o TravelPlanner…", zh: "TravelPlanner 加载中…", ar: "جارٍ تحميل TravelPlanner…" },
  ob_skip: { es: "Omitir", en: "Skip", pt: "Pular", zh: "跳过", ar: "تخطي" },
  ob_next: { es: "Siguiente", en: "Next", pt: "Próximo", zh: "下一步", ar: "التالي" },
  ob_start: { es: "Empezar", en: "Get started", pt: "Começar", zh: "开始使用", ar: "ابدأ" },
  ob1_title: {
    es: "Organiza cada viaje en un solo lugar",
    en: "Organize every trip in one place",
    pt: "Organize cada viagem em um só lugar",
    zh: "在一个地方管理你的每一次旅行",
    ar: "نظّم كل رحلة في مكان واحد",
  },
  ob1_body: {
    es: "Itinerario, vuelos, gastos y mapa — todo junto, y funciona incluso sin conexión.",
    en: "Itinerary, flights, expenses and map — all together, and it works even offline.",
    pt: "Itinerário, voos, despesas e mapa — tudo junto, e funciona até offline.",
    zh: "行程、航班、支出和地图——全部整合，离线也能用。",
    ar: "خط السير، الرحلات الجوية، المصاريف والخريطة — كل شيء في مكان واحد، ويعمل حتى بدون اتصال.",
  },
  ob2_title: {
    es: "Nada de capturas de pantalla sueltas",
    en: "No more loose screenshots",
    pt: "Chega de prints soltos",
    zh: "不再需要东拼西凑的截图",
    ar: "لا مزيد من لقطات الشاشة المتفرقة",
  },
  ob2_body: {
    es: "Guarda reservas, actividades y presupuesto en su sitio, listos para consultar al instante.",
    en: "Keep bookings, activities and budget in one place, ready to check instantly.",
    pt: "Guarde reservas, atividades e orçamento no lugar certo, prontos para consultar na hora.",
    zh: "把预订、活动和预算都归置好，随时一目了然。",
    ar: "احفظ الحجوزات والأنشطة والميزانية في مكانها، جاهزة للاطلاع الفوري.",
  },
  ob3_title: { es: "¿Cómo sueles viajar?", en: "How do you usually travel?", pt: "Como você costuma viajar?", zh: "你通常怎样旅行？", ar: "كيف تسافر عادةً؟" },
  ob3_body: {
    es: "Nos ayuda a mostrarte lo más útil primero — puedes cambiarlo después.",
    en: "It helps us show you what's most useful first — you can change it later.",
    pt: "Isso nos ajuda a mostrar primeiro o que é mais útil — você pode mudar depois.",
    zh: "这能帮助我们优先展示最实用的内容——之后仍可修改。",
    ar: "هذا يساعدنا على عرض الأكثر فائدة لك أولاً — ويمكنك تغييره لاحقاً.",
  },
  traveler_solo: { es: "Solo/a", en: "Solo", pt: "Sozinho(a)", zh: "独自旅行", ar: "منفرد" },
  traveler_couple: { es: "En pareja", en: "As a couple", pt: "Em casal", zh: "情侣出行", ar: "مع الشريك" },
  traveler_family: { es: "En familia", en: "With family", pt: "Em família", zh: "家庭出游", ar: "مع العائلة" },
  traveler_friends: { es: "Con amigos", en: "With friends", pt: "Com amigos", zh: "和朋友一起", ar: "مع الأصدقاء" },

  // ---------- Ajustes ----------
  settings_title: { es: "Ajustes", en: "Settings", pt: "Ajustes", zh: "设置", ar: "الإعدادات" },
  settings_account: { es: "Mi cuenta", en: "My account", pt: "Minha conta", zh: "我的账户", ar: "حسابي" },
  settings_login: { es: "Iniciar sesión", en: "Sign in", pt: "Entrar", zh: "登录", ar: "تسجيل الدخول" },
  settings_backup: { es: "Copiar / restaurar datos", en: "Back up / restore data", pt: "Copiar / restaurar dados", zh: "备份/恢复数据", ar: "نسخ / استعادة البيانات" },
  settings_join_shared: { es: "Unirme a un viaje compartido", en: "Join a shared trip", pt: "Entrar em uma viagem compartilhada", zh: "加入共享行程", ar: "الانضمام إلى رحلة مشتركة" },
  settings_profile: { es: "Mi perfil", en: "My profile", pt: "Meu perfil", zh: "我的账户", ar: "ملفي الشخصي" },
  settings_config: { es: "Configuración", en: "Preferences", pt: "Preferências", zh: "偏好设置", ar: "التفضيلات" },
  settings_theme: { es: "Tema", en: "Theme", pt: "Tema", zh: "主题", ar: "المظهر" },
  settings_language: { es: "Idioma", en: "Language", pt: "Idioma", zh: "语言", ar: "اللغة" },
  settings_notifications: { es: "Notificaciones", en: "Notifications", pt: "Notificações", zh: "通知", ar: "الإشعارات" },
  settings_security: { es: "Seguridad (PIN)", en: "Security (PIN)", pt: "Segurança (PIN)", zh: "安全（PIN 码）", ar: "الأمان (رمز PIN)" },
  settings_dev: { es: "Modo desarrollador", en: "Developer mode", pt: "Modo desenvolvedor", zh: "开发者模式", ar: "وضع المطوّر" },
  settings_privacy: { es: "Política de privacidad", en: "Privacy policy", pt: "Política de privacidade", zh: "隐私政策", ar: "سياسة الخصوصية" },
  settings_cache: { es: "Uso de caché", en: "Cache usage", pt: "Uso de cache", zh: "缓存使用情况", ar: "استخدام التخزين المؤقت" },
  lang_updated: { es: "Idioma actualizado", en: "Language updated", pt: "Idioma atualizado", zh: "语言已更新", ar: "تم تحديث اللغة" },
  lang_system_note: {
    es: "Detectado del dispositivo automáticamente. Puedes cambiarlo cuando quieras.",
    en: "Detected automatically from your device. You can change it anytime.",
    pt: "Detectado automaticamente do dispositivo. Você pode mudar quando quiser.",
    zh: "已根据设备自动检测。你可以随时更改。",
    ar: "تم اكتشافها تلقائياً من جهازك. يمكنك تغييرها في أي وقت.",
  },

  brand_tagline: { es: "Tus viajes, en un solo lugar", en: "Your trips, all in one place", pt: "Suas viagens, em um só lugar", zh: "你的旅行，尽在一处", ar: "رحلاتك، في مكان واحد" },
  settings_tooltip: { es: "Ajustes", en: "Settings", pt: "Ajustes", zh: "设置", ar: "الإعدادات" },
  trip_days_count: { es: "{n} días", en: "{n} days", pt: "{n} dias", zh: "{n} 天", ar: "{n} أيام" },
  trip_activities_count: { es: "{n} actividades", en: "{n} activities", pt: "{n} atividades", zh: "{n} 项活动", ar: "{n} أنشطة" },

  // ---------- Cuenta atrás de la tarjeta de viaje ----------
  countdown_days: { es: "Faltan {n} días", en: "{n} days left", pt: "Faltam {n} dias", zh: "还剩 {n} 天", ar: "باقي {n} أيام" },
  countdown_day: { es: "Falta 1 día", en: "1 day left", pt: "Falta 1 dia", zh: "还剩 1 天", ar: "باقي يوم واحد" },
  countdown_today: { es: "¡Es hoy!", en: "It's today!", pt: "É hoje!", zh: "就是今天！", ar: "إنه اليوم!" },
  countdown_starts_today: { es: "¡Empieza hoy!", en: "Starting today!", pt: "Começa hoje!", zh: "今天出发！", ar: "تبدأ اليوم!" },
  countdown_ongoing: { es: "En curso", en: "Ongoing", pt: "Em andamento", zh: "进行中", ar: "جارية الآن" },
  countdown_finished: { es: "Finalizado", en: "Finished", pt: "Finalizado", zh: "已结束", ar: "منتهية" },

  // ---------- Resumen del viaje ----------
  stat_budget: { es: "Presupuesto", en: "Budget", pt: "Orçamento", zh: "预算", ar: "الميزانية" },
  stat_places: { es: "Lugares", en: "Places", pt: "Lugares", zh: "地点", ar: "الأماكن" },
  stat_reservations: { es: "Reservas", en: "Bookings", pt: "Reservas", zh: "预订", ar: "الحجوزات" },
  stat_days: { es: "Días", en: "Days", pt: "Dias", zh: "天数", ar: "الأيام" },
  stat_flights: { es: "Vuelos", en: "Flights", pt: "Voos", zh: "航班", ar: "الرحلات الجوية" },
  stat_transport: { es: "Transporte", en: "Transport", pt: "Transporte", zh: "交通", ar: "المواصلات" },
  stat_hotels: { es: "Hospedajes", en: "Stays", pt: "Hospedagens", zh: "住宿", ar: "الإقامة" },
  stat_activities: { es: "Actividades", en: "Activities", pt: "Atividades", zh: "活动", ar: "الأنشطة" },
  stat_spent: { es: "Gastado", en: "Spent", pt: "Gasto", zh: "已花费", ar: "المصروف" },
  summary_title: { es: "Resumen del viaje", en: "Trip summary", pt: "Resumo da viagem", zh: "行程概览", ar: "ملخص الرحلة" },
  summary_placeholder: {
    es: "Añade una nota al viaje para verla aquí.",
    en: "Add a note to your trip to see it here.",
    pt: "Adicione uma nota à viagem para vê-la aqui.",
    zh: "为行程添加备注，即可在此查看。",
    ar: "أضف ملاحظة للرحلة لتظهر هنا.",
  },
  next_event: { es: "Próximo evento", en: "Next up", pt: "Próximo evento", zh: "下一项", ar: "الحدث القادم" },
  activity_fallback: { es: "Actividad", en: "Activity", pt: "Atividade", zh: "活动", ar: "نشاط" },
  flight_to: { es: "Vuelo a {dest}", en: "Flight to {dest}", pt: "Voo para {dest}", zh: "飞往 {dest} 的航班", ar: "رحلة إلى {dest}" },

  // ---------- Títulos de sección ----------
  section_flights: { es: "Vuelos", en: "Flights", pt: "Voos", zh: "航班", ar: "الرحلات الجوية" },
  section_hotels: { es: "Hospedajes", en: "Stays", pt: "Hospedagens", zh: "住宿", ar: "الإقامة" },
  section_itinerary: { es: "Itinerario", en: "Itinerary", pt: "Itinerário", zh: "行程安排", ar: "خط السير" },
  section_transport: { es: "Transporte", en: "Transport", pt: "Transporte", zh: "交通", ar: "المواصلات" },
  section_reservations: { es: "Reservas", en: "Bookings", pt: "Reservas", zh: "预订", ar: "الحجوزات" },
  section_expenses: { es: "Gastos", en: "Expenses", pt: "Despesas", zh: "支出", ar: "المصاريف" },
  section_checklist: { es: "Checklist", en: "Checklist", pt: "Checklist", zh: "清单", ar: "قائمة المهام" },
  section_calendar: { es: "Calendario", en: "Calendar", pt: "Calendário", zh: "日历", ar: "التقويم" },
  section_map: { es: "Mapa", en: "Map", pt: "Mapa", zh: "地图", ar: "الخريطة" },
  section_trip_fallback: { es: "Viaje", en: "Trip", pt: "Viagem", zh: "行程", ar: "الرحلة" },

  // ---------- Estados vacíos ----------
  empty_flights: { es: "No hay vuelos añadidos todavía.", en: "No flights added yet.", pt: "Nenhum voo adicionado ainda.", zh: "还没有添加任何航班。", ar: "لم تتم إضافة أي رحلات جوية بعد." },
  empty_hotels: { es: "No hay hoteles añadidos todavía.", en: "No hotels added yet.", pt: "Nenhum hotel adicionado ainda.", zh: "还没有添加任何酒店。", ar: "لم تتم إضافة أي فنادق بعد." },
  empty_itinerary_general: {
    es: "Todavía no has planificado ninguna actividad.",
    en: "You haven't planned any activities yet.",
    pt: "Você ainda não planejou nenhuma atividade.",
    zh: "你还没有安排任何活动。",
    ar: "لم تخطط لأي نشاط بعد.",
  },
  empty_itinerary_day: { es: "No hay actividades este día todavía.", en: "No activities for this day yet.", pt: "Nenhuma atividade neste dia ainda.", zh: "这一天还没有安排活动。", ar: "لا توجد أنشطة في هذا اليوم بعد." },
  empty_transport: { es: "No hay trayectos añadidos todavía.", en: "No trips added yet.", pt: "Nenhum trajeto adicionado ainda.", zh: "还没有添加任何行程段。", ar: "لم تتم إضافة أي رحلة تنقل بعد." },
  empty_reservations: { es: "No hay reservas añadidas todavía.", en: "No bookings added yet.", pt: "Nenhuma reserva adicionada ainda.", zh: "还没有添加任何预订。", ar: "لم تتم إضافة أي حجوزات بعد." },
  empty_expenses: { es: "No hay gastos registrados todavía.", en: "No expenses recorded yet.", pt: "Nenhuma despesa registrada ainda.", zh: "还没有记录任何支出。", ar: "لم يتم تسجيل أي مصاريف بعد." },
  empty_checklist: { es: "No hay tareas todavía.", en: "No tasks yet.", pt: "Nenhuma tarefa ainda.", zh: "还没有任何待办事项。", ar: "لا توجد مهام بعد." },
  empty_map: {
    es: "Añade direcciones a tus hoteles, actividades o reservas para verlas en el mapa.",
    en: "Add addresses to your hotels, activities or bookings to see them on the map.",
    pt: "Adicione endereços aos seus hotéis, atividades ou reservas para vê-los no mapa.",
    zh: "为酒店、活动或预订添加地址，即可在地图上查看。",
    ar: "أضف عناوين لفنادقك أو أنشطتك أو حجوزاتك لرؤيتها على الخريطة.",
  },

  // ---------- Hoja "Secciones del viaje" ----------
  sections_sheet_title: { es: "Secciones del viaje", en: "Trip sections", pt: "Seções da viagem", zh: "行程分类", ar: "أقسام الرحلة" },
  sections_sheet_discover: { es: "Descubre", en: "Discover", pt: "Descubra", zh: "发现", ar: "استكشف" },
};

async function detectLanguage() {
  const candidates = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "es"]).map((l) =>
    l.slice(0, 2).toLowerCase()
  );
  for (const c of candidates) {
    if (SUPPORTED.includes(c)) return c;
  }
  return "es";
}

async function getLanguage() {
  const saved = await Data.settingGet(LANG_KEY);
  if (saved && SUPPORTED.includes(saved)) return saved;
  return detectLanguage();
}

async function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return;
  await Data.settingSet(LANG_KEY, lang);
  currentLang = lang;
  applyDocumentLanguage(lang);
  // Caché de solo lectura rápida para el script del <head> de
  // index.html: así el splash/arranque del próximo arranque ya sale
  // en el idioma elegido a mano, sin esperar a leer IndexedDB.
  try {
    localStorage.setItem("tp_lang_cache", lang);
  } catch (e) {}
}

function applyDocumentLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = LANGUAGES[lang]?.dir || "ltr";
}

let currentLang = "es";

/** Se llama al arrancar, antes del primer render (como loadTheme). */
async function loadLanguage() {
  currentLang = await getLanguage();
  applyDocumentLanguage(currentLang);
  return currentLang;
}

function t(key, vars) {
  const entry = T[key];
  let str = entry ? entry[currentLang] || entry.es || key : key;
  if (vars) {
    for (const k in vars) str = str.replaceAll(`{${k}}`, vars[k]);
  }
  return str;
}

export { LANGUAGES, SUPPORTED, loadLanguage, getLanguage, setLanguage, t };
