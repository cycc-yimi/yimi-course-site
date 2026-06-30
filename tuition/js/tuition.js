(function () {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const state = { courses: [], rules: null, payment: null, selected: [] };
  const formatter = new Intl.NumberFormat("zh-TW");

  async function loadData() {
    if (location.protocol === "file:" && window.TUITION_DATA) {
      state.courses = window.TUITION_DATA.courseData.courses;
      state.rules = window.TUITION_DATA.rules;
      state.payment = window.TUITION_DATA.payment;
      return;
    }
    const [courseData, rules, payment] = await Promise.all([
      fetch("./data/courses.json").then(checkResponse),
      fetch("./data/discount-rules.json").then(checkResponse),
      fetch("./data/payment-info.json").then(checkResponse),
    ]);
    state.courses = courseData.courses;
    state.rules = rules;
    state.payment = payment;
  }

  function checkResponse(response) {
    if (!response.ok) throw new Error(`資料載入失敗：${response.status}`);
    return response.json();
  }

  function option(value, label) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    return node;
  }

  function initSelectors() {
    const area = $("#area");
    [...new Set(state.courses.map((course) => course.area))].forEach((name) =>
      area.append(option(name, name)),
    );
    updateCourseOptions();
    area.addEventListener("change", updateCourseOptions);

    const discounts = $("#main-discounts");
    discounts.innerHTML = state.rules.mainDiscounts
      .filter((rule) => rule.id !== "none")
      .map(
        (rule) => `
          <label class="discount-choice">
            <input type="checkbox" name="main-discount" value="${rule.id}">
            <span><strong>${rule.label}</strong><small>${rule.description}</small></span>
          </label>`,
      )
      .join("");
    $("#notices").innerHTML = state.payment.notices.map((text) => `<li>${text}</li>`).join("");
  }

  function updateCourseOptions() {
    const area = $("#area").value;
    const select = $("#course-select");
    select.replaceChildren(option("", "請選擇課程"));
    state.courses
      .filter((course) => !area || course.area === area)
      .forEach((course) =>
        select.append(option(course.code, `${course.code}｜${course.name}`)),
      );
  }

  function addByCode() {
    const code = $("#course-code").value.trim().toUpperCase();
    const course = state.courses.find((item) => item.code.toUpperCase() === code);
    if (!course) return showMessage("找不到此課程編號，請確認後再試。", true);
    addCourse(course);
    $("#course-code").value = "";
  }

  function addBySelect() {
    const course = state.courses.find((item) => item.code === $("#course-select").value);
    if (!course) return showMessage("請先選擇一門課程。", true);
    addCourse(course);
  }

  function addCourse(course) {
    if (state.selected.some((item) => item.code === course.code)) {
      return showMessage("這門課已加入，不需重複加入。", true);
    }
    state.selected.push({ ...course, childCount: 0 });
    showMessage(`已加入 ${course.code} ${course.name}`);
    renderSelected();
    calculate();
  }

  function removeCourse(index) {
    state.selected.splice(index, 1);
    renderSelected();
    calculate();
  }

  function registeredChildCount() {
    return Number($("#child-new-count").value) + Number($("#child-returning-count").value);
  }

  function parseTimeRange(value) {
    const match = String(value || "").match(
      /(\d{1,2}):(\d{2})\s*[-–—~～]\s*(\d{1,2}):(\d{2})/,
    );
    if (!match) return null;
    return {
      start: Number(match[1]) * 60 + Number(match[2]),
      end: Number(match[3]) * 60 + Number(match[4]),
    };
  }

  function coursesOverlap(first, second) {
    if (!first.weekday || first.weekday !== second.weekday) return false;
    const firstTime = parseTimeRange(first.time);
    const secondTime = parseTimeRange(second.time);
    if (!firstTime || !secondTime) return false;
    return firstTime.start < secondTime.end && secondTime.start < firstTime.end;
  }

  function conflictCodes(course, courses = state.selected) {
    return courses
      .filter((other) => other.code !== course.code && coursesOverlap(course, other))
      .map((other) => other.code);
  }

  function conflictNotice(course, courses) {
    const codes = conflictCodes(course, courses);
    return codes.length
      ? `<em class="schedule-conflict">⚠ 與 ${codes.join("、")} 上課時段重疊</em>`
      : "";
  }

  function renderSelected() {
    const list = $("#selected-courses");
    const childLimit = registeredChildCount();
    state.selected.forEach((course) => {
      course.childCount = Math.min(course.childCount, childLimit);
    });
    $("#empty-selection").hidden = state.selected.length > 0;
    list.innerHTML = state.selected
      .map(
        (course, index) => `
          <li class="selected-card">
            <div>
              <strong>${index + 1}. ${course.code} ${escapeHtml(course.name)}</strong>
              ${conflictNotice(course, state.selected)}
              <span>${course.area}｜${escapeHtml(course.venue)} ${escapeHtml(course.classroom)}｜${course.credits}學分｜雜費${formatMoney(course.miscellaneousFee)}</span>
              ${course.miscellaneousFeePending ? '<em class="pending">雜費待行政確認</em>' : ""}
            </div>
            <label class="child-field">同行兒童
              <select data-child-index="${index}">
                ${Array.from({ length: childLimit + 1 }, (_, count) =>
                  `<option value="${count}" ${course.childCount === count ? "selected" : ""}>${count}位</option>`,
                ).join("")}
              </select>
            </label>
            <button class="button danger" type="button" data-remove="${index}">刪除</button>
          </li>`,
      )
      .join("");
    list.querySelectorAll("[data-remove]").forEach((button) =>
      button.addEventListener("click", () => removeCourse(Number(button.dataset.remove))),
    );
    list.querySelectorAll("[data-child-index]").forEach((select) =>
      select.addEventListener("change", () => {
        state.selected[Number(select.dataset.childIndex)].childCount = Number(select.value);
        calculate();
      }),
    );
  }

  function readInput() {
    return {
      studentStatus: document.querySelector("[name=student-status]:checked").value,
      paymentPeriod: document.querySelector("[name=payment-period]:checked").value,
      mainDiscounts: [...document.querySelectorAll("[name=main-discount]:checked")].map(
        (input) => input.value,
      ),
      childNewCount: Number($("#child-new-count").value),
      childReturningCount: Number($("#child-returning-count").value),
      fourPlusOne: $("#four-plus-one").checked,
      partnerLearning: $("#partner-learning").checked,
      partnerCourseIndex: $("#partner-course").value,
      courses: state.selected,
    };
  }

  function calculate() {
    if (!state.rules) return;
    const result = TuitionCalculator.calculateTuition(readInput(), state.rules);
    renderResult(result);
  }

  function renderResult(result) {
    const section = $("#result");
    $("#no-result").hidden = result.details.length > 0;
    $("#result-content").hidden = result.details.length === 0;
    $("#result-items").innerHTML = result.details
      .map(
        (item, index) => `
          <article class="result-card">
            <h3>第${chineseNumber(index + 1)}門：${item.code} ${escapeHtml(item.name)}</h3>
            ${conflictNotice(item, result.details)}
            <dl>
              <div><dt>成人報名費</dt><dd>${formatMoney(item.adultRegistrationFee)}${item.isFourPlusOneFree ? "（四送一贈送課免收）" : index ? "（一期僅收一次）" : ""}</dd></div>
              ${item.childRegistrationFee ? `<div><dt>兒童報名費</dt><dd>${formatMoney(item.childRegistrationFee)}（每位一期僅收一次）</dd></div>` : ""}
              <div><dt>成人學分費</dt><dd>${formatMoney(item.creditFee)}</dd></div>
              ${item.childCount ? `<div><dt>${item.childCount}位兒童原學分費</dt><dd>${formatMoney(item.childOriginalFee)}</dd></div>` : ""}
              <div><dt>優惠折扣</dt><dd class="discount">-${formatMoney(item.discount)}</dd></div>
              <div><dt>雜費${item.childCount ? "（含同行兒童）" : ""}</dt><dd>${formatMoney(item.miscFee)}</dd></div>
              <div class="subtotal"><dt>小計</dt><dd>${formatMoney(item.subtotal)}</dd></div>
            </dl>
            ${item.notes.length ? `<p class="applied">已套用：${item.notes.join("、")}</p>` : ""}
            ${item.miscellaneousFeePending ? '<p class="warning">此課雜費待行政確認，暫以0元計。</p>' : ""}
          </article>`,
      )
      .join("");
    const freeCourse = result.details.find((item) => item.isFourPlusOneFree);
    const promotionSummary = $("#promotion-summary");
    promotionSummary.hidden = !freeCourse;
    promotionSummary.textContent = freeCourse
      ? `四送一贈送課程：${freeCourse.code} ${freeCourse.name}（報名費與學分費免費，雜費照收）`
      : "";
    $("#warnings").innerHTML = result.warnings.map((text) => `<li>${text}</li>`).join("");
    $("#warnings").hidden = result.warnings.length === 0;
    $("#grand-total").textContent = formatMoney(result.total);
    section.dataset.copyText = buildCopyText(result);
    updatePartnerOptions();
  }

  function updatePartnerOptions() {
    const select = $("#partner-course");
    const current = select.value;
    select.replaceChildren();
    state.selected.forEach((course, index) =>
      select.append(option(String(index), `${course.code} ${course.name}`)),
    );
    if ([...select.options].some((item) => item.value === current)) select.value = current;
    select.disabled = !$("#partner-learning").checked || state.selected.length === 0;
  }

  function buildCopyText(result) {
    const lines = result.details.flatMap((item, index) => [
      `第${chineseNumber(index + 1)}門：${item.code} ${item.name}`,
      ...(conflictCodes(item, result.details).length
        ? [`⚠ 與 ${conflictCodes(item, result.details).join("、")} 上課時段重疊`]
        : []),
      `成人報名費：${item.adultRegistrationFee}元${item.isFourPlusOneFree ? "（四送一贈送課免收）" : index ? "（一期僅收一次）" : ""}`,
      ...(item.childRegistrationFee
        ? [`兒童報名費：${item.childRegistrationFee}元（每位一期僅收一次）`]
        : []),
      `學分費：${item.creditFee + item.childOriginalFee}元`,
      `優惠折扣：-${item.discount}元`,
      `雜費：${item.miscFee}元`,
      `小計：${item.subtotal}元`,
      ...(item.notes.length ? [`已套用：${item.notes.join("、")}`] : []),
      "",
    ]);
    const freeCourse = result.details.find((item) => item.isFourPlusOneFree);
    if (freeCourse) {
      lines.push(
        `★ 四送一贈送課程：${freeCourse.code} ${freeCourse.name}（報名費與學分費免費，雜費照收）`,
        "",
      );
    }
    lines.push(
      `總計：${result.total}元`,
      "",
      "試算前請留意：",
      ...state.payment.notices.map((notice) => `• ${notice}`),
    );
    return lines.join("\n");
  }

  async function copyResult() {
    const text = $("#result").dataset.copyText;
    if (!text) return showMessage("請先加入課程再複製。", true);
    try {
      await navigator.clipboard.writeText(text);
      showMessage("試算結果已複製，可直接貼到 LINE 或訊息。");
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      showMessage("試算結果已複製。");
    }
  }

  function showMessage(text, error = false) {
    const node = $("#status-message");
    node.textContent = text;
    node.className = error ? "status error" : "status";
  }

  function formatMoney(value) {
    return `${formatter.format(value)}元`;
  }

  function chineseNumber(value) {
    return ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"][value - 1] || value;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function bindEvents() {
    $("#add-code").addEventListener("click", addByCode);
    $("#add-select").addEventListener("click", addBySelect);
    $("#course-code").addEventListener("keydown", (event) => {
      if (event.key === "Enter") addByCode();
    });
    $("#calculator-form").addEventListener("change", (event) => {
      if (event.target.id === "child-new-count" || event.target.id === "child-returning-count") {
        const changed = event.target;
        const other =
          changed.id === "child-new-count" ? $("#child-returning-count") : $("#child-new-count");
        const allowed = Math.max(2 - Number(changed.value), 0);
        if (Number(other.value) > allowed) {
          other.value = String(allowed);
          showMessage("親子共學同行兒童合計至多2位，已自動調整人數。");
        }
        renderSelected();
      }
      calculate();
    });
    $("#copy-result").addEventListener("click", copyResult);
    $("#print-result").addEventListener("click", () => window.print());
  }

  async function start() {
    try {
      await loadData();
      initSelectors();
      bindEvents();
      renderSelected();
      calculate();
    } catch (error) {
      showMessage(`${error.message}。請確認 data/tuition-data.js 與其他檔案都在原資料夾中。`, true);
    }
  }

  start();
})();
