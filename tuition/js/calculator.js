(function (global) {
  "use strict";

  const money = (value) => Math.round(Number(value) || 0);

  function findFreeCourseIndex(courses, rules) {
    const candidates = courses
      .map((course, index) => ({ course, index }))
      .filter(({ course }) => Number(course.credits || 0) <= rules.fourPlusOne.freeCourseMaxCredits)
      .filter(({ index }) => {
        const otherCredits = courses
          .filter((_, otherIndex) => otherIndex !== index)
          .map((course) => Number(course.credits || 0))
          .sort((a, b) => b - a)
          .slice(0, rules.fourPlusOne.minimumPaidCourses);
        return (
          otherCredits.length >= rules.fourPlusOne.minimumPaidCourses &&
          otherCredits.reduce((sum, credits) => sum + credits, 0) >=
            rules.fourPlusOne.minimumPaidCredits
        );
      });
    candidates.sort(
      (a, b) =>
        Number(b.course.credits || 0) - Number(a.course.credits || 0) ||
        money(b.course.creditFee) - money(a.course.creditFee),
    );
    return candidates.length ? candidates[0].index : -1;
  }

  function optimizeMainDiscounts(courses, selectedIds, rules, isOnTime) {
    const selectedRules = rules.mainDiscounts.filter(
      (rule) => rule.id !== "none" && selectedIds.includes(rule.id),
    );
    const limitedRules = selectedRules.filter((rule) => rule.maxCourses);
    let states = new Map([["0".repeat(limitedRules.length), { score: 0, assignments: [] }]]);

    courses.forEach((course) => {
      const next = new Map();
      const options = [null, ...selectedRules.filter((rule) =>
        (!rule.deadlineRequired || isOnTime) &&
        !(rule.excludeDiscountedCourse && course.discountedCourse),
      )];
      states.forEach((state, key) => {
        const used = key.split("").map(Number);
        options.forEach((rule) => {
          const nextUsed = [...used];
          if (rule?.maxCourses) {
            const limitedIndex = limitedRules.findIndex((item) => item.id === rule.id);
            if (nextUsed[limitedIndex] >= rule.maxCourses) return;
            nextUsed[limitedIndex] += 1;
          }
          const saving = rule
            ? money(course.credits * rules.creditFeePerCredit * (1 - rule.rate))
            : 0;
          const nextKey = nextUsed.join("");
          const candidate = {
            score: state.score + saving,
            assignments: [...state.assignments, rule],
          };
          if (!next.has(nextKey) || next.get(nextKey).score < candidate.score) {
            next.set(nextKey, candidate);
          }
        });
      });
      states = next;
    });
    return [...states.values()].sort((a, b) => b.score - a.score)[0]?.assignments ?? [];
  }

  function calculateTuition(input, rules) {
    const courses = Array.isArray(input.courses) ? input.courses : [];
    const registrationFee =
      rules.registrationFees[input.studentStatus] ?? rules.registrationFees.returning;
    const selectedIds = Array.isArray(input.mainDiscounts)
      ? input.mainDiscounts
      : input.mainDiscount && input.mainDiscount !== "none"
        ? [input.mainDiscount]
        : [];
    const isOnTime = input.paymentPeriod === "onTime";
    const warnings = [];
    const freeCourseIndex =
      input.fourPlusOne && courses.length >= 5 ? findFreeCourseIndex(courses, rules) : -1;
    const fourPlusOneQualified = freeCourseIndex >= 0;

    if (input.fourPlusOne && !fourPlusOneQualified) {
      warnings.push("四送一資格未成立：五門中需有四門合計至少8學分，且另一門為2學分以下。");
    }
    rules.mainDiscounts
      .filter((rule) => selectedIds.includes(rule.id) && rule.deadlineRequired && !isOnTime)
      .forEach((rule) =>
        warnings.push(`${rule.label}須於115/07/16含以前完成繳費，本次未套用。`),
      );

    const mainAssignments = fourPlusOneQualified
      ? courses.map(() => null)
      : optimizeMainDiscounts(courses, selectedIds, rules, isOnTime);
    const registrationCourseIndex = courses.findIndex((_, index) => index !== freeCourseIndex);
    const childNewCount = Math.max(money(input.childNewCount), 0);
    const childReturningCount = Math.max(money(input.childReturningCount), 0);
    const registeredChildCount = Math.min(
      childNewCount + childReturningCount,
      rules.familyLearning.maxChildren,
    );
    const childRegistrationTotal =
      Math.min(childNewCount, registeredChildCount) * rules.registrationFees.new +
      Math.min(
        childReturningCount,
        Math.max(registeredChildCount - childNewCount, 0),
      ) * rules.registrationFees.returning;
    const childRegistrationCourseIndex = courses.findIndex(
      (course) => money(course.childCount) > 0,
    );

    const details = courses.map((course, index) => {
      const baseCreditFee = money(course.credits * rules.creditFeePerCredit);
      const childCount = Math.min(
        Math.max(money(course.childCount), 0),
        rules.familyLearning.maxChildren,
      );
      const childOriginalFee = baseCreditFee * childCount;
      const miscFee = money(course.miscellaneousFee) * (1 + childCount);
      let discount = 0;
      const notes = [];

      if (fourPlusOneQualified) {
        if (index === freeCourseIndex) {
          discount += baseCreditFee;
          notes.push("四送一：本門報名費與學分費免費");
        } else {
          notes.push("四送一付費課程以原價計算");
        }
      } else if (mainAssignments[index]) {
        const rule = mainAssignments[index];
        discount += baseCreditFee * (1 - rule.rate);
        notes.push(`${rule.label}（系統已自動安排最優惠課程）`);
      }

      if (childCount > 0) {
        if (course.discountedCourse) {
          notes.push("已優惠課程不適用親子共學");
        } else {
          discount += childOriginalFee * (1 - rules.familyLearning.childRate);
          notes.push(`親子共學：${childCount}位兒童學分費半價`);
        }
      }

      if (input.partnerLearning) {
        if (course.discountedCourse) {
          notes.push("已優惠課程不適用伴侶共學");
        } else if (index === Number(input.partnerCourseIndex || 0)) {
          discount += rules.partnerLearning.amount;
          notes.push("伴侶共學再折100元（限其中一人）");
        }
      }

      discount = Math.min(money(discount), baseCreditFee + childOriginalFee);
      const itemRegistrationFee =
        index === registrationCourseIndex && index !== freeCourseIndex ? registrationFee : 0;
      const childRegistrationFee =
        index === childRegistrationCourseIndex ? childRegistrationTotal : 0;
      const totalRegistrationFee = itemRegistrationFee + childRegistrationFee;
      const subtotal =
        totalRegistrationFee + baseCreditFee + childOriginalFee + miscFee - discount;
      return {
        ...course,
        registrationFee: totalRegistrationFee,
        adultRegistrationFee: itemRegistrationFee,
        childRegistrationFee,
        creditFee: baseCreditFee,
        childOriginalFee,
        childCount,
        miscFee,
        discount,
        subtotal,
        notes,
        isFourPlusOneFree: index === freeCourseIndex,
      };
    });

    return {
      details,
      total: details.reduce((sum, item) => sum + item.subtotal, 0),
      warnings: [...new Set(warnings)],
      fourPlusOneQualified,
      freeCourseIndex,
    };
  }

  global.TuitionCalculator = { calculateTuition };
})(typeof window !== "undefined" ? window : globalThis);
