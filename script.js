const AREAS = ["朴子", "水上", "新港", "太保", "中埔", "鹿草", "六腳"];
const DAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
const PERIODS = ["上午", "下午", "晚上"];
const EXCLUDED_COURSE_CODES = new Set([
  "1152C55", "1152C56", "1152C57", "1152C58",
  "1152C59", "1152C60", "1152C61", "1152C63",
]);
const NEW_COURSE_CODES = new Set([
  "1152C67", "1152C52", "1152C68", "1152C69", "1152A09", "1152C46",
  "1152C18", "1152C65", "1152C07", "1152C27", "1152C53", "1152C17",
  "1152C64", "1152C41", "1152C22", "1152C62", "1152C66", "1152C49",
]);
const AREA_IMAGES = {
  朴子: "assets/area-朴子.png",
  水上: "assets/area-水上.png",
  新港: "assets/area-新港.png",
  太保: "assets/area-太保.png",
  中埔: "assets/area-中埔.png",
  鹿草: "assets/area-鹿草.png",
  六腳: "assets/area-六腳.png",
};
const AREA_ENGLISH_NAMES = {
  朴子: "Puzi City",
  水上: "Shuishang Township",
  新港: "Xingang Township",
  太保: "Taibao City",
  中埔: "Zhongpu Township",
  鹿草: "Lucao Township",
  六腳: "Liujiao Township",
};

const state = {
  courses: [],
  sessions: [],
  sessionsByCourse: new Map(),
};

const app = document.querySelector("#app");
const noticeModal = document.querySelector("[data-notice-modal]");
const noticeModalTitle = document.querySelector("[data-notice-title]");
const noticeModalBody = document.querySelector("[data-notice-body]");
const contactModal = document.querySelector("[data-contact-modal]");

function getCourseStatus(course) {
  const status = window.YIMI_COURSE_STATUS || {};
  return status[course["課程編號"]] || course["報名狀態"] || "";
}

function courseBadges(course) {
  const badges = [];
  if (NEW_COURSE_CODES.has(course["課程編號"]) || (course["新舊課"] || "").includes("新課")) {
    badges.push({ text: "新課", type: "new" });
  }
  const status = getCourseStatus(course);
  if (status) {
    const type = status === "額滿" ? "full" : status === "候補" ? "waitlist" : "closed";
    badges.push({ text: status, type });
  }
  return badges;
}

function badgeMarkup(course) {
  return courseBadges(course)
    .map((badge) => `<span class="course-badge ${badge.type}">${badge.text}</span>`)
    .join("");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((item) => item.some(Boolean))
    .map((item) =>
      Object.fromEntries(headers.map((header, index) => [header, item[index] || ""])),
    );
}

function normalizeArea(course) {
  const location = course["上課地點"] || "";
  const title = course["課程名稱"] || "";
  if (location.includes("嘉義縣立圖書館") || location.includes("嘉義縣立田徑場")) {
    return "朴子";
  }
  return AREAS.find((area) => location.includes(area)) || AREAS.find((area) => title.includes(area)) || "其他";
}

function getPeriod(course) {
  const hour = Number((course["開始時間"] || "").split(":")[0]);
  if (Number.isNaN(hour)) return "未定";
  if (hour < 12) return "上午";
  if (hour < 18) return "下午";
  return "晚上";
}

function formatClassTime(course) {
  const day = course["星期"] || "";
  const start = course["開始時間"] || "";
  const end = course["結束時間"] || "";
  return [day, start && end ? `${start}-${end}` : start || end].filter(Boolean).join(" ");
}

function hasRealWeekContent(week) {
  const text = [week["週次標題"], week["週次內容"]].filter(Boolean).join("").trim();
  if (!text) return false;
  return !["課程內容", "無", ""].includes(text);
}

function getCourseWeeks(course) {
  const sessions = state.sessionsByCourse.get(course["課程編號"]) || [];
  return sessions.filter(hasRealWeekContent).length || sessions.length || "";
}

function formatMonthDay(value) {
  const match = String(value || "").match(/(\d{1,2})月(\d{1,2})日/);
  if (!match) return "";
  return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}`;
}

function getCourseDateRange(course) {
  const sessions = (state.sessionsByCourse.get(course["課程編號"]) || []).filter(hasRealWeekContent);
  if (!sessions.length) return "";
  const start = formatMonthDay(sessions[0]["日期"]);
  const end = formatMonthDay(sessions[sessions.length - 1]["日期"]);
  return start && end ? `${start}-${end}` : start || end;
}

function courseUrl(course) {
  return `#/course/${encodeURIComponent(course["課程編號"])}`;
}

function areaUrl(area) {
  return `#/area/${encodeURIComponent(area)}`;
}

function cloneTemplate(id) {
  return document.querySelector(id).content.cloneNode(true);
}

function setText(root, selector, value) {
  const target = root.querySelector(selector);
  if (target) target.textContent = value || "";
}

function renderHome() {
  const view = cloneTemplate("#home-template");
  setText(view, "[data-total-courses]", state.courses.length);

  const grid = view.querySelector("[data-region-grid]");
  AREAS.forEach((area) => {
    const courses = state.courses.filter((course) => course.area === area);
    const card = document.createElement("a");
    card.className = "region-card";
    card.href = areaUrl(area);
    card.innerHTML = `
      <img src="${AREA_IMAGES[area]}" alt="${area}課程" />
      <div class="region-card-text">
        <strong>${area}課程</strong>
        <span class="course-count">${courses.length} 門課程</span>
      </div>
    `;
    grid.append(card);
  });

  app.replaceChildren(view);
  bindNoticeCards();
  bindHomeSearch();
}

function bindHomeSearch() {
  const input = document.querySelector("[data-home-search]");
  const results = document.querySelector("[data-home-search-results]");
  if (!input || !results) return;

  function draw() {
    const keyword = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (!keyword) {
      results.hidden = true;
      return;
    }
    results.hidden = false;

    const matches = state.courses
      .filter((course) => {
        const text = [
          course["課程編號"],
          course["課程名稱"],
          course["授課講師"],
          course["上課地點"],
          course["課程類別"],
          course.area,
        ].join(" ").toLowerCase();
        return text.includes(keyword);
      })
      .slice(0, 18);

    if (!matches.length) {
      results.innerHTML = `<div class="empty">沒有找到符合條件的課程。</div>`;
      return;
    }

    matches.forEach((course) => results.append(courseCard(course)));
  }

  input.addEventListener("input", draw);
  draw();
}

function openNoticeModal(card) {
  const title = card.querySelector("summary strong")?.textContent || "課程報名注意事項";
  const content = card.querySelector(".notice-content")?.cloneNode(true);
  if (!content) return;

  noticeModalTitle.textContent = title;
  noticeModalBody.replaceChildren(content);
  noticeModal.hidden = false;
  document.body.classList.add("modal-open");
  noticeModal.querySelector(".modal-close").focus();
}

function closeNoticeModal() {
  noticeModal.hidden = true;
  noticeModalBody.replaceChildren();
  document.body.classList.remove("modal-open");
}

function openContactModal() {
  contactModal.hidden = false;
  document.body.classList.add("modal-open");
  contactModal.querySelector(".modal-close").focus();
}

function closeContactModal() {
  contactModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function bindNoticeCards() {
  document.querySelectorAll(".notice-card").forEach((card) => {
    card.addEventListener("click", (event) => {
      event.preventDefault();
      openNoticeModal(card);
    });
  });
}

function courseCard(course) {
  const card = document.createElement("a");
  card.className = "course-card";
  card.href = courseUrl(course);
  card.innerHTML = `
    <div class="course-badges">${badgeMarkup(course)}</div>
    <strong>${course["課程名稱"]}</strong>
    <p>${course["授課講師"] || "講師待定"} · ${course["上課地點"] || "地點待定"}</p>
    <div class="course-meta">
      <span>${course["開始時間"] || ""}${course["結束時間"] ? `-${course["結束時間"]}` : ""}</span>
      <span>${course["課程類別"] || "課程"}</span>
      <span>${getCourseWeeks(course)}週</span>
      <span>${getCourseDateRange(course)}</span>
    </div>
  `;
  return card;
}

function renderArea(area) {
  const view = cloneTemplate("#area-template");
  const areaCourses = state.courses
    .filter((course) => course.area === area)
    .sort((a, b) => {
      const day = DAYS.indexOf(a["星期"]) - DAYS.indexOf(b["星期"]);
      if (day !== 0) return day;
      return (a["開始時間"] || "").localeCompare(b["開始時間"] || "");
    });

  setText(view, ".eyebrow", AREA_ENGLISH_NAMES[area] || "Area Courses");
  setText(view, "[data-area-title]", `${area}課程`);
  setText(view, "[data-area-summary]", `${areaCourses.length} 門課程，依星期與上午、下午、晚上分類。`);

  const schedule = view.querySelector("[data-schedule]");
  const search = view.querySelector("[data-search]");
  const periodFilter = view.querySelector("[data-period-filter]");
  const dayTabs = view.querySelector("[data-day-tabs]");
  let selectedDay = "全部";

  ["全部", ...DAYS].forEach((day) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = day === "全部" ? "全部星期" : day;
    button.dataset.day = day;
    if (day === selectedDay) button.classList.add("active");
    button.addEventListener("click", () => {
      selectedDay = day;
      dayTabs.querySelectorAll("button").forEach((item) => {
        item.classList.toggle("active", item.dataset.day === selectedDay);
      });
      draw();
      schedule.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    dayTabs.append(button);
  });

  function draw() {
    const keyword = search.value.trim().toLowerCase();
    const selectedPeriod = periodFilter.value;
    schedule.replaceChildren();

    DAYS.filter((day) => selectedDay === "全部" || day === selectedDay).forEach((day) => {
      const dayCourses = areaCourses.filter((course) => {
        const text = `${course["課程編號"]} ${course["課程名稱"]} ${course["授課講師"]} ${course["上課地點"]}`.toLowerCase();
        return course["星期"] === day && (!keyword || text.includes(keyword));
      });

      if (!dayCourses.length) return;

      const section = document.createElement("section");
      section.className = "day-section";
      section.innerHTML = `
        <div class="day-header">
          <h2>${day}</h2>
          <span>${dayCourses.length} 門</span>
        </div>
        <div class="period-grid"></div>
      `;

      const periodGrid = section.querySelector(".period-grid");
      PERIODS.filter((period) => selectedPeriod === "全部" || period === selectedPeriod).forEach((period) => {
        const courses = dayCourses.filter((course) => course.period === period);
        const column = document.createElement("div");
        column.className = "period-column";
        column.innerHTML = `<div class="period-title">${period}</div><div class="course-stack"></div>`;
        const stack = column.querySelector(".course-stack");
        if (courses.length) {
          courses.forEach((course) => stack.append(courseCard(course)));
        } else {
          stack.innerHTML = `<div class="empty">這個時段目前沒有課程</div>`;
        }
        periodGrid.append(column);
      });

      schedule.append(section);
    });

    if (!schedule.children.length) {
      schedule.innerHTML = `<div class="empty">沒有符合條件的課程。</div>`;
    }
  }

  search.addEventListener("input", draw);
  periodFilter.addEventListener("change", draw);
  app.replaceChildren(view);
  draw();
}

function detailBlock(title, value) {
  if (!value) return "";
  return `
    <section class="detail-block">
      <h2>${title}</h2>
      <p>${value}</p>
    </section>
  `;
}

function renderCourse(code) {
  const course = state.courses.find((item) => item["課程編號"] === code);
  if (!course) {
    renderHome();
    return;
  }

  const view = cloneTemplate("#course-template");
  view.querySelector("[data-back-to-area]").href = areaUrl(course.area);
  view.querySelector("[data-floating-back]").href = areaUrl(course.area);
  setText(view, "[data-course-code]", course["課程編號"]);
  setText(view, "[data-course-name]", course["課程名稱"]);
  setText(
    view,
    "[data-course-meta]",
    `${course.area} · ${course["星期"] || "時間待定"} ${course["開始時間"] || ""}-${course["結束時間"] || ""}`,
  );

  const title = view.querySelector(".detail-title");
  const badges = document.createElement("div");
  badges.className = "course-badges detail-badges";
  badges.innerHTML = badgeMarkup(course);
  title.append(badges);

  const facts = [
    ["授課講師", course["授課講師"]],
    ["上課地點", course["上課地點"]],
    ["上課時間", formatClassTime(course)],
    ["課程日期", getCourseDateRange(course)],
    ["課程類別", course["課程類別"]],
    ["選課人數", course["選課人數"]],
    ["學分數", course["學分數"]],
    ["招生對象", course["招生對象"]],
  ];

  view.querySelector("[data-course-facts]").innerHTML = facts
    .filter(([, value]) => value)
    .map(([label, value]) => `<div class="fact-row"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  view.querySelector("[data-course-detail]").innerHTML = [
    detailBlock("課程目標", course["教學目標"]),
    detailBlock("授課方式", course["授課方式"]),
    detailBlock("材料費與相關費用", course["教材費相關費用內容"]),
    detailBlock("學習效益", course["學習效益"]),
    detailBlock("評量方式", course["評量方式"]),
    detailBlock("講師學經歷", [course["講師學歷"], course["講師資歷"], course["講師專長"]].filter(Boolean).join("\n\n")),
    detailBlock("特殊限制", course["特殊限制"]),
    detailBlock("具備基礎", course["具基礎知識"]),
    detailBlock("參考書籍", course["參考書籍"]),
    detailBlock("備註", course["備註"]),
  ].join("");

  const weeks = (state.sessionsByCourse.get(code) || []).filter(hasRealWeekContent);
  const weekList = view.querySelector("[data-week-list]");
  weeks.forEach((week) => {
    const card = document.createElement("article");
    card.className = "week-card";
    card.innerHTML = `
      <span>第 ${week["週次"]} 週</span>
      <p>${[week["週次標題"], week["週次內容"]].filter(Boolean).join("\n") || "課程內容"}</p>
    `;
    weekList.append(card);
  });

  app.replaceChildren(view);
  document.querySelector("[data-scroll-top]").addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function route() {
  const hash = decodeURIComponent(location.hash || "#/");
  if (hash === "#notice" || hash === "#regions") {
    renderHome();
    requestAnimationFrame(() => {
      document.querySelector(hash)?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    return;
  }
  const [, page, value] = hash.split("/");
  if (page === "area" && value) {
    renderArea(value);
  } else if (page === "course" && value) {
    renderCourse(value);
  } else {
    renderHome();
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

async function init() {
  const embedded = window.YIMI_COURSE_DATA;
  const courses = embedded
    ? embedded.courses
    : parseCsv(await fetch("outputs/courses_import.csv").then((response) => response.text()));
  const sessions = embedded
    ? embedded.sessions
    : parseCsv(await fetch("outputs/weekly_sessions_import.csv").then((response) => response.text()));

  state.courses = courses
    .filter((course) => !EXCLUDED_COURSE_CODES.has(course["課程編號"]))
    .map((course) => ({
      ...course,
      area: normalizeArea(course),
      period: getPeriod(course),
    }));
  state.sessions = sessions.filter((session) => !EXCLUDED_COURSE_CODES.has(session["課程編號"]));
  state.sessionsByCourse = state.sessions.reduce((map, session) => {
    const code = session["課程編號"];
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(session);
    return map;
  }, new Map());

  state.sessionsByCourse.forEach((sessions) => {
    sessions.sort((a, b) => Number(a["週次"]) - Number(b["週次"]));
  });

  window.addEventListener("hashchange", route);
  document.querySelector("[data-open-contact]").addEventListener("click", openContactModal);
  document.querySelectorAll("[data-close-notice]").forEach((control) => {
    control.addEventListener("click", closeNoticeModal);
  });
  document.querySelectorAll("[data-close-contact]").forEach((control) => {
    control.addEventListener("click", closeContactModal);
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !noticeModal.hidden) closeNoticeModal();
    if (event.key === "Escape" && !contactModal.hidden) closeContactModal();
  });
  route();
}

init().catch(() => {
  app.innerHTML = `<section class="loading"><p>課程資料讀取失敗，請確認 CSV 檔案是否存在。</p></section>`;
});
