(function () {
  "use strict";

  var DATA = window.PARENT_CHILD_TEST_DATA;
  if (!DATA || !Array.isArray(DATA.questions) || !Array.isArray(DATA.results)) {
    document.body.innerHTML = '<div class="fatal-error">测试数据加载失败，请确认 data.js 与 index.html 放在同一目录后刷新。</div>';
    return;
  }

  var letters = ["A", "B", "C", "D"];
  var baseMetricKeys = ["coDecision", "expression", "repair", "support", "boundaries"];
  var state = createDefaultState();
  var currentMatch = null;
  var lastShareBlob = null;
  var lastShareFileName = "亲子关系测试结果.png";
  var toastTimer = null;
  var advanceTimer = null;
  var analysisTimers = [];

  function $(id) {
    return document.getElementById(id);
  }

  function createDefaultState() {
    return {
      version: DATA.version,
      relation: "妈妈",
      avatar: "妈妈",
      age: "6-9岁",
      parentName: "",
      childName: "",
      index: 0,
      answers: new Array(DATA.questions.length).fill(null),
      lastScreen: "home",
      resultId: null,
      updatedAt: Date.now()
    };
  }

  function readSavedState() {
    try {
      var parsed = JSON.parse(localStorage.getItem(DATA.storageKey) || "null");
      if (!parsed || !Array.isArray(parsed.answers)) return null;
      if (parsed.answers.length !== DATA.questions.length) return null;
      parsed.answers = parsed.answers.map(function (answer) {
        return Number.isInteger(answer) && answer >= 0 && answer <= 3 ? answer : null;
      });
      parsed.index = Math.max(0, Math.min(DATA.questions.length - 1, Number(parsed.index) || 0));
      parsed.relation = ["妈妈", "爸爸", "家长"].indexOf(parsed.relation) >= 0 ? parsed.relation : "妈妈";
      parsed.avatar = parsed.relation;
      parsed.age = parsed.age || "6-9岁";
      parsed.parentName = String(parsed.parentName || "").slice(0, 12);
      parsed.childName = String(parsed.childName || "").slice(0, 12);
      return Object.assign(createDefaultState(), parsed);
    } catch (error) {
      return null;
    }
  }

  function saveState() {
    state.updatedAt = Date.now();
    try {
      localStorage.setItem(DATA.storageKey, JSON.stringify(state));
    } catch (error) {
      // Safari private mode or a full storage quota must not block the test.
    }
    updateResumeCard();
  }

  function clearAnalysisTimers() {
    analysisTimers.forEach(function (timer) { clearTimeout(timer); });
    analysisTimers = [];
  }

  function showScreen(id, persist) {
    clearAnalysisTimers();
    var activeScreen = null;
    document.querySelectorAll(".screen").forEach(function (screen) {
      var active = screen.id === id;
      screen.classList.toggle("active", active);
      if (active) activeScreen = screen;
    });
    if (persist !== false) {
      state.lastScreen = id;
      saveState();
    }
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch (error) {
      window.scrollTo(0, 0);
    }
    if (activeScreen) activeScreen.scrollTop = 0;
  }

  function answeredCount() {
    return state.answers.filter(function (answer) { return answer !== null; }).length;
  }

  function updateResumeCard() {
    var count = answeredCount();
    var card = $("resumeCard");
    if (!card) return;
    card.classList.toggle("hidden", count === 0);
    $("resumeText").textContent = count === DATA.questions.length
      ? "结果已生成，点此再次查看"
      : "已完成 " + count + " / " + DATA.questions.length + " 题";
  }

  function syncSetupUI() {
    $("parentLabel").textContent = state.relation + "的昵称";
    $("parentName").placeholder = "例如：" + (state.relation === "家长" ? "大朋友" : "小满" + state.relation);
    $("parentName").value = state.parentName;
    $("childName").value = state.childName;
    if ($("parentCount")) $("parentCount").textContent = state.parentName.length + " / 12";
    if ($("childCount")) $("childCount").textContent = state.childName.length + " / 12";

    document.querySelectorAll("[data-relation]").forEach(function (button) {
      var active = button.getAttribute("data-relation") === state.relation;
      button.classList.toggle("active", active);
      button.setAttribute("aria-checked", active ? "true" : "false");
    });
    document.querySelectorAll("[data-age]").forEach(function (button) {
      var active = button.getAttribute("data-age") === state.age;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setRelation(button) {
    state.relation = button.getAttribute("data-relation");
    state.avatar = state.relation;
    syncSetupUI();
    saveState();
  }

  function setAge(button) {
    state.age = button.getAttribute("data-age");
    syncSetupUI();
    saveState();
  }

  function goSetup() {
    syncSetupUI();
    showScreen("setup");
  }

  function goIdentity() {
    syncSetupUI();
    showScreen("identity");
  }

  function beginQuiz() {
    state.parentName = $("parentName").value.trim().slice(0, 12);
    state.childName = $("childName").value.trim().slice(0, 12);
    var firstMissing = state.answers.indexOf(null);
    state.index = firstMissing >= 0 ? firstMissing : 0;
    if (state.index >= 12 && state.answers[11] !== null && state.answers[12] === null) {
      showHandoff();
      return;
    }
    showScreen("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    var question = DATA.questions[state.index];
    if (!question) {
      toast("题目加载失败，请返回重试");
      return;
    }
    var isChild = question.side === "child";
    var sideIndex = isChild ? state.index - 11 : state.index + 1;
    $("phaseText").textContent = isChild ? displayName(state.childName, "孩子") + "作答" : state.relation + "作答";
    $("quizLead").textContent = isChild ? "按你的真实感受选择" : "先按你的真实做法选择";
    $("quizSub").textContent = isChild ? "这里没有家长想听的标准答案" : "没有标准答案，也不用替孩子猜";
    $("counter").textContent = (sideIndex < 10 ? "0" : "") + sideIndex + " / 12";
    $("progressRing").style.background = "conic-gradient(var(--v3-coral) 0 " + (sideIndex / 12 * 100).toFixed(2) + "%, rgba(66,37,72,.08) " + (sideIndex / 12 * 100).toFixed(2) + "%)";
    $("questionKicker").textContent = isChild ? "孩子题" : "家长题";
    var topicKey = baseMetricKeys[question.dim];
    $("questionTopic").textContent = topicKey && DATA.dimensions[topicKey] ? DATA.dimensions[topicKey].name : "生活情景";
    $("questionText").textContent = question.q;

    var selected = state.answers[state.index];
    $("options").innerHTML = question.opts.map(function (option, index) {
      var active = index === selected;
      return '<button class="v3-option' + (active ? " selected" : "") + '" type="button" role="radio" aria-checked="' + (active ? "true" : "false") + '" data-answer="' + index + '">' +
        '<span class="v3-option-code">' + letters[index] + '</span>' +
        '<span>' + escapeHTML(option) + '</span><i class="v3-option-radio"></i></button>';
    }).join("");
    $("quiz").scrollTop = 0;
  }

  function answerQuestion(button) {
    if (advanceTimer) clearTimeout(advanceTimer);
    var choice = Number(button.getAttribute("data-answer"));
    if (!Number.isInteger(choice)) return;
    state.answers[state.index] = choice;
    saveState();
    document.querySelectorAll("[data-answer]").forEach(function (option) {
      var active = Number(option.getAttribute("data-answer")) === choice;
      option.classList.toggle("selected", active);
      option.setAttribute("aria-checked", active ? "true" : "false");
      option.disabled = true;
    });

    advanceTimer = setTimeout(function () {
      if (state.index === 11) {
        state.index = 12;
        showHandoff();
      } else if (state.index === DATA.questions.length - 1) {
        runAnalysis();
      } else {
        state.index += 1;
        saveState();
        renderQuestion();
      }
    }, 220);
  }

  function previousQuestion() {
    if (advanceTimer) {
      clearTimeout(advanceTimer);
      advanceTimer = null;
    }
    if (state.index === 0) {
      syncSetupUI();
      showScreen("setup");
      return;
    }
    if (state.index === 12) {
      showHandoff();
      return;
    }
    state.index -= 1;
    saveState();
    renderQuestion();
  }

  function showHandoff() {
    var childName = state.childName || "孩子";
    $("handoffText").textContent = "接下来12题，请" + childName + "按照真实感觉选择。家长先不要偷看答案哦。";
    showScreen("handoff");
  }

  function backToParent() {
    state.index = 11;
    showScreen("quiz");
    renderQuestion();
  }

  function continueChild() {
    state.index = 12;
    showScreen("quiz");
    renderQuestion();
  }

  function average(list) {
    if (!list.length) return 0;
    return list.reduce(function (sum, value) { return sum + value; }, 0) / list.length;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function calculateMetrics() {
    var bySide = {
      parent: { coDecision: [], expression: [], repair: [], support: [], boundaries: [] },
      child: { coDecision: [], expression: [], repair: [], support: [], boundaries: [] }
    };

    DATA.questions.forEach(function (question, index) {
      var answer = state.answers[index];
      if (answer === null || typeof question.scores[answer] !== "number") return;
      var metricKey = baseMetricKeys[question.dim];
      bySide[question.side][metricKey].push(question.scores[answer]);
    });

    var parent = {};
    var child = {};
    var joint = {};
    baseMetricKeys.forEach(function (key) {
      parent[key] = average(bySide.parent[key]);
      child[key] = average(bySide.child[key]);
      joint[key] = average([parent[key], child[key]]);
    });

    var alignment = 100 - average(baseMetricKeys.map(function (key) {
      return Math.abs(parent[key] - child[key]);
    }));
    var mutuality = average(["expression", "repair", "support"].map(function (key) {
      return Math.min(parent[key], child[key]);
    }));
    var tension = (100 - joint.repair) * 0.62 + (100 - alignment) * 0.38;

    var metrics = Object.assign({}, joint, {
      alignment: clamp(alignment, 0, 100),
      mutuality: clamp(mutuality, 0, 100),
      tension: clamp(tension, 0, 100)
    });
    Object.keys(metrics).forEach(function (key) {
      metrics[key] = Math.round(metrics[key]);
    });
    return { parent: parent, child: child, metrics: metrics };
  }

  function scoreResult(result, metrics) {
    var weightedDistance = 0;
    var totalWeight = 0;
    DATA.metricKeys.forEach(function (key) {
      var weight = Number(result.match.weights[key]) || 1;
      weightedDistance += Math.abs(metrics[key] - result.match.targets[key]) * weight;
      totalWeight += weight;
    });
    var score = 100 - weightedDistance / totalWeight;
    var conditionDetails = result.match.conditions.map(function (condition) {
      var value = metrics[condition.metric];
      var hit = value >= condition.min && value <= condition.max;
      var missDistance = value < condition.min ? condition.min - value : value > condition.max ? value - condition.max : 0;
      score += hit ? condition.bonus : -Math.min(condition.bonus, missDistance / 5);
      return Object.assign({}, condition, { value: value, hit: hit });
    });
    return { result: result, score: score, conditions: conditionDetails };
  }

  function selectResult() {
    var calculated = calculateMetrics();
    var ranked = DATA.results.map(function (result) {
      return scoreResult(result, calculated.metrics);
    }).sort(function (a, b) {
      return b.score === a.score ? a.result.id - b.result.id : b.score - a.score;
    });
    return {
      result: ranked[0].result,
      score: ranked[0].score,
      conditions: ranked[0].conditions,
      metrics: calculated.metrics,
      parent: calculated.parent,
      child: calculated.child,
      runnerUp: ranked[1].result.name
    };
  }

  function runAnalysis() {
    if (answeredCount() !== DATA.questions.length) {
      state.index = Math.max(0, state.answers.indexOf(null));
      showScreen("quiz");
      renderQuestion();
      toast("还有题目没有回答");
      return;
    }
    currentMatch = selectResult();
    state.resultId = currentMatch.result.id;
    showScreen("analysis");
    $("analysisProgress").style.width = "6%";
    var steps = $("analysisSteps").querySelectorAll("li");
    analysisTimers.push(setTimeout(function () {
      $("analysisProgress").style.width = "42%";
      steps.forEach(function (step, index) { step.classList.toggle("active", index === 1); });
    }, 420));
    analysisTimers.push(setTimeout(function () {
      $("analysisProgress").style.width = "78%";
      steps.forEach(function (step, index) { step.classList.toggle("active", index === 2); });
    }, 900));
    analysisTimers.push(setTimeout(function () {
      $("analysisProgress").style.width = "100%";
    }, 1250));
    analysisTimers.push(setTimeout(function () {
      renderResult(currentMatch);
    }, 1550));
  }

  function findSavedResult() {
    if (answeredCount() !== DATA.questions.length) return null;
    var match = selectResult();
    state.resultId = match.result.id;
    return match;
  }

  function displayName(value, fallback) {
    return value && value.trim() ? value.trim() : fallback;
  }

  function resultArtworkSrc(result) {
    var number = String(result.id).padStart(2, "0");
    return "assets/results/artwork/result-" + number + "-artwork.jpg";
  }

  function renderResult(match) {
    currentMatch = match || findSavedResult();
    if (!currentMatch) {
      toast("请先完成全部题目");
      resumeProgress();
      return;
    }
    var result = currentMatch.result;
    var parentName = displayName(state.parentName, state.relation);
    var childName = displayName(state.childName, "孩子");
    var dimensionRows = DATA.metricKeys.map(function (key) {
      var dim = DATA.dimensions[key];
      var value = currentMatch.metrics[key];
      return '<div class="v3-dimension-row" title="' + escapeHTML(dim.description) + '"><span>' + escapeHTML(dim.name) + '</span>' +
        '<div class="v3-dimension-track"><i style="width:' + value + '%"></i></div><b>' + value + '</b></div>';
    }).join("");
    var matchLines = currentMatch.conditions.map(function (condition) {
      var dim = DATA.dimensions[condition.metric];
      var status = condition.hit ? "命中" : "接近";
      return "<li>" + status + "重点条件：<b>" + escapeHTML(dim.name) + " " + condition.value + "分</b>；该结果的优先范围为 " + condition.min + "–" + condition.max + "分。</li>";
    }).join("");

    $("resultBody").innerHTML =
      '<article class="v3-result-hero">' +
        '<div class="v3-result-summary"><p>' + escapeHTML(parentName) + '<i></i>' + escapeHTML(childName) + '</p><span>你们的相处模式是</span><h1 id="resultName">' + escapeHTML(result.name) + '</h1></div>' +
        '<figure class="v3-result-artwork"><img src="' + encodeURI(resultArtworkSrc(result)) + '" alt="' + escapeHTML(result.name) + '专属结果插画，画面中有家长和孩子"></figure>' +
        '<p class="v3-result-line">' + escapeHTML(result.line) + '</p>' +
        '<div class="v3-hero-tags">' + result.tags.map(function (tag) { return '<span><i></i>' + escapeHTML(tag) + '</span>'; }).join("") + '</div>' +
        '<div class="v3-result-meta"><span>关系等级</span><strong>' + escapeHTML(result.level) + '</strong><i></i><span>专属匹配</span></div>' +
        '<div class="v3-result-quick"><button class="v3-result-share" type="button" data-action="export"><svg><use href="#icon-share"/></svg>生成分享图</button><button class="v3-result-detail" type="button" data-action="scroll-analysis">查看关系分析</button></div>' +
      '</article>' +
      '<section class="v3-result-section v3-story" id="resultAnalysis"><div class="v3-section-heading"><h2>你们的关系解读</h2><span>' + escapeHTML(result.level) + '</span></div><p>' + escapeHTML(result.detail) + '</p></section>' +
      '<section class="v3-result-section"><div class="v3-section-heading"><h2>8项关系维度</h2><span>满分100</span></div><p class="v3-dimension-intro">前5项来自双方答题均分；感受同频比较双方差距；双向回应观察彼此能否互相接住。</p><div class="v3-dimension-list">' + dimensionRows + '</div></section>' +
      '<section class="v3-result-section"><div class="v3-section-heading"><h2>为什么匹配到它</h2><span>可解释算法</span></div><div class="v3-match-box"><p>' + escapeHTML(result.match.summary) + ' 48个结果使用同一套加权规则，最高分结果胜出，不会随机。</p><ul>' + matchLines + '</ul></div></section>' +
      '<div class="v3-result-bottom"><button class="v3-secondary" type="button" data-action="restart">重新测试</button><button class="v3-primary" type="button" data-action="export"><svg><use href="#icon-share"/></svg>生成分享图</button></div>' +
      '<p class="v3-disclaimer">本测试仅供娱乐和亲子沟通参考，不构成专业心理诊断。</p>';
    var resultImage = $("resultBody").querySelector(".v3-result-artwork img");
    if (resultImage && !(resultImage.complete && resultImage.naturalWidth > 0)) {
      var revealed = false;
      var revealResult = function () {
        if (revealed) return;
        revealed = true;
        showScreen("result");
      };
      resultImage.addEventListener("load", revealResult, { once: true });
      resultImage.addEventListener("error", revealResult, { once: true });
      setTimeout(revealResult, 5000);
      return;
    }
    showScreen("result");
  }

  function resumeProgress() {
    var count = answeredCount();
    if (count === DATA.questions.length) {
      renderResult(findSavedResult());
      return;
    }
    if (state.lastScreen === "handoff") {
      showHandoff();
      return;
    }
    if (state.lastScreen === "quiz") {
      showScreen("quiz");
      renderQuestion();
      toast("已恢复上次答题进度");
      return;
    }
    var firstMissing = state.answers.indexOf(null);
    if (firstMissing >= 12 && state.answers[11] !== null && state.answers[12] === null) {
      state.index = 12;
      showHandoff();
      return;
    }
    state.index = firstMissing >= 0 ? firstMissing : state.index;
    if (count === 0) {
      goSetup();
    } else {
      showScreen("quiz");
      renderQuestion();
      toast("已恢复上次答题进度");
    }
  }

  function restartTest() {
    if (advanceTimer) clearTimeout(advanceTimer);
    state = createDefaultState();
    currentMatch = null;
    lastShareBlob = null;
    try { localStorage.removeItem(DATA.storageKey); } catch (error) {}
    syncSetupUI();
    updateResumeCard();
    showScreen("home", false);
    toast("已开始一份新测试");
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character];
    });
  }

  function toast(message) {
    var element = $("toast");
    element.textContent = message;
    element.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove("show"); }, 2000);
  }

  function openModal(id) {
    $(id).hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal(id) {
    $(id).hidden = true;
    document.body.style.overflow = "";
  }

  function roundRectPath(context, x, y, width, height, radius) {
    var r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function drawCenteredLines(context, text, centerX, startY, maxWidth, lineHeight, maxLines) {
    var lines = [];
    var current = "";
    Array.from(String(text)).forEach(function (character) {
      var next = current + character;
      if (current && context.measureText(next).width > maxWidth) {
        lines.push(current);
        current = character;
      } else {
        current = next;
      }
    });
    if (current) lines.push(current);
    lines.slice(0, maxLines || lines.length).forEach(function (line, index) {
      context.fillText(line, centerX, startY + index * lineHeight);
    });
  }

  function drawShareTag(context, text, centerX, y, width, fill, color) {
    context.fillStyle = fill;
    roundRectPath(context, centerX - width / 2, y, width, 64, 32);
    context.fill();
    context.fillStyle = color;
    context.font = '800 24px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
    context.fillText(text, centerX, y + 41);
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      if (/^https?:/.test(window.location.protocol)) image.crossOrigin = "anonymous";
      image.onload = function () { resolve(image); };
      image.onerror = reject;
      image.src = src;
    });
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      if (!canvas.toBlob) {
        try {
          var data = canvas.toDataURL("image/png");
          var binary = atob(data.split(",")[1]);
          var bytes = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
          resolve(new Blob([bytes], { type: "image/png" }));
        } catch (error) {
          reject(error);
        }
        return;
      }
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("PNG生成失败"));
      }, "image/png", 1);
    });
  }

  async function exportShareCard() {
    if (!currentMatch) return;
    var button = document.querySelector('[data-action="export"]');
    if (button) {
      button.disabled = true;
      button.textContent = "正在生成…";
    }
    try {
      var result = currentMatch.result;
      var canvas = $("shareCanvas");
      var context = canvas.getContext("2d");
      var parentName = displayName(state.parentName, state.relation);
      var childName = displayName(state.childName, "孩子");
      context.clearRect(0, 0, canvas.width, canvas.height);

      var background = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      background.addColorStop(0, "#fff8f0");
      background.addColorStop(.55, "#fff3ea");
      background.addColorStop(1, "#f4effa");
      context.fillStyle = background;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(255,255,255,.78)";
      roundRectPath(context, 35, 35, 1010, canvas.height - 70, 58);
      context.fill();

      context.textAlign = "center";
      context.fillStyle = "#e36f5b";
      context.font = '900 24px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText("亲子关系测试结果", 540, 94);
      context.fillStyle = "#6f5b70";
      context.font = '800 34px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText(parentName + "  ×  " + childName, 540, 154);
      context.fillStyle = "#8b7887";
      context.font = '750 24px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText("你们的相处模式是", 540, 208);
      context.fillStyle = result.c1 || "#ff714f";
      context.font = '900 78px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText(result.name, 540, 292);

      // The data URI mirrors the file in assets/results so canvas export also works
      // when index.html is opened directly through file://.
      var image = await loadImage(result.illustrationData || result.illustration);
      var imageBox = { x: 75, y: 340, width: 930, height: 748 };
      context.save();
      roundRectPath(context, imageBox.x, imageBox.y, imageBox.width, imageBox.height, 36);
      context.clip();
      context.drawImage(image, 72, 505, 796, 640, imageBox.x, imageBox.y, imageBox.width, imageBox.height);
      context.restore();

      context.fillStyle = "#3a174d";
      context.font = '850 34px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      drawCenteredLines(context, result.line, 540, 1160, 870, 48, 2);

      drawShareTag(context, result.tags[0], 235, 1275, 270, "#ffe7de", "#c9543c");
      drawShareTag(context, result.tags[1], 540, 1275, 270, "#eaf6ed", "#41856a");
      drawShareTag(context, result.tags[2], 845, 1275, 270, "#f0e9fa", "#75539b");

      context.fillStyle = "#9a8792";
      context.font = '750 23px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText("关系等级", 440, 1395);
      context.fillStyle = result.c1 || "#ff714f";
      context.font = '900 27px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText(result.level, 540, 1395);
      context.fillStyle = "#9a8792";
      context.font = '750 23px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText("·  专属匹配", 665, 1395);

      context.fillStyle = "#f7eee9";
      roundRectPath(context, 95, 1450, 890, 260, 38);
      context.fill();
      context.fillStyle = "#3a174d";
      context.font = '900 29px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText("你们的关系解读", 540, 1515);
      context.fillStyle = "#6d596c";
      context.font = '700 25px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      drawCenteredLines(context, result.detail, 540, 1570, 790, 40, 3);

      context.fillStyle = "#8f7d88";
      context.font = '750 21px -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif';
      context.fillText("长按保存 · 把这张专属关系卡分享给家人", 540, 1815);

      lastShareBlob = await canvasToBlob(canvas);
      lastShareFileName = "亲子关系-" + result.name + "-" + parentName + "和" + childName + ".png";
      var oldUrl = $("downloadLink").getAttribute("href");
      if (oldUrl && oldUrl.indexOf("blob:") === 0) URL.revokeObjectURL(oldUrl);
      var objectUrl = URL.createObjectURL(lastShareBlob);
      $("sharePreview").src = objectUrl;
      $("downloadLink").href = objectUrl;
      $("downloadLink").download = lastShareFileName;
      openModal("shareModal");
    } catch (error) {
      toast(window.location.protocol === "file:" ? "请用本地服务器预览后生成PNG" : "图片生成失败，请刷新后重试");
      console.error(error);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "生成高清PNG";
      }
    }
  }

  async function nativeShare() {
    if (!lastShareBlob) {
      toast("请先生成分享卡");
      return;
    }
    try {
      var file = new File([lastShareBlob], lastShareFileName, { type: "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: "我们的亲子关系结果", text: currentMatch.result.name, files: [file] });
      } else {
        toast("当前浏览器请长按图片保存");
      }
    } catch (error) {
      if (error && error.name !== "AbortError") toast("当前浏览器请长按图片保存");
    }
  }

  function handleAction(action) {
    switch (action) {
      case "home":
      case "back-home":
        showScreen("home");
        break;
      case "back-identity":
        goIdentity();
        break;
      case "show-intro":
        openModal("introModal");
        break;
      case "close-modal":
        closeModal("introModal");
        break;
      case "close-share":
        closeModal("shareModal");
        break;
      case "go-setup":
        goSetup();
        break;
      case "go-identity":
        goIdentity();
        break;
      case "previous-question":
        previousQuestion();
        break;
      case "back-to-parent":
        backToParent();
        break;
      case "continue-child":
        continueChild();
        break;
      case "resume":
        resumeProgress();
        break;
      case "restart":
        restartTest();
        break;
      case "export":
        exportShareCard();
        break;
      case "scroll-analysis":
        var analysisSection = $("resultAnalysis");
        if (analysisSection) analysisSection.scrollIntoView({ behavior: "smooth", block: "start" });
        break;
      case "native-share":
        nativeShare();
        break;
    }
  }

  document.addEventListener("click", function (event) {
    var relationButton = event.target.closest("[data-relation]");
    if (relationButton) {
      setRelation(relationButton);
      return;
    }
    var ageButton = event.target.closest("[data-age]");
    if (ageButton) {
      setAge(ageButton);
      return;
    }
    var answerButton = event.target.closest("[data-answer]");
    if (answerButton && !answerButton.disabled) {
      answerQuestion(answerButton);
      return;
    }
    var actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      event.preventDefault();
      handleAction(actionButton.getAttribute("data-action"));
    }
  });

  $("setupForm").addEventListener("submit", function (event) {
    event.preventDefault();
    beginQuiz();
  });
  $("parentName").addEventListener("input", function () {
    state.parentName = this.value.slice(0, 12);
    if ($("parentCount")) $("parentCount").textContent = state.parentName.length + " / 12";
    saveState();
  });
  $("childName").addEventListener("input", function () {
    state.childName = this.value.slice(0, 12);
    if ($("childCount")) $("childCount").textContent = state.childName.length + " / 12";
    saveState();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      if (!$("shareModal").hidden) closeModal("shareModal");
      if (!$("introModal").hidden) closeModal("introModal");
    }
  });

  if (/(?:\?|&)restart=1(?:&|$)/.test(window.location.search)) {
    try { localStorage.removeItem(DATA.storageKey); } catch (error) {}
    try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (error) {}
  }
  state = readSavedState() || createDefaultState();
  syncSetupUI();
  updateResumeCard();
  if (answeredCount() === DATA.questions.length) {
    renderResult(findSavedResult());
  } else if (answeredCount() > 0 && ["quiz", "handoff", "analysis"].indexOf(state.lastScreen) >= 0) {
    resumeProgress();
  } else {
    showScreen("home", false);
  }
  document.documentElement.dataset.parentChildAppReady = "true";
})();
