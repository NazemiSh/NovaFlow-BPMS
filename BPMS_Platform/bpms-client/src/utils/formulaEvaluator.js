/**
 * سامانه نوافلو (NovaFlow) - موتور ارزیابی امن فرمول‌های ریاضی و توابع آماری
 * بدون استفاده از eval یا توابع مخاطره‌آمیز (Safe Expression Parser)
 */

// تبدیل اعداد فارسی و عربی به ارقام انگلیسی
export const toEnglishDigits = (str) => {
  if (typeof str !== 'string') str = String(str ?? '');
  const pDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const aDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  let res = str;
  pDigits.forEach((d, i) => { res = res.replaceAll(d, String(i)); });
  aDigits.forEach((d, i) => { res = res.replaceAll(d, String(i)); });
  return res;
};

// پارس امن یک مقدار به عدد
export const parseNumberSafe = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const cleaned = toEnglishDigits(val).replace(/,/g, '').replace(/\s+/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

// استخراج فهرست مسطح فیلدها از آرایه سوالات یا آرایه سکشن‌ها
export const flattenFormQuestions = (formQuestionsOrSections = []) => {
  if (!Array.isArray(formQuestionsOrSections)) return [];
  const flat = [];
  formQuestionsOrSections.forEach(item => {
    if (!item || typeof item !== 'object') return;
    if (Array.isArray(item.questions)) {
      item.questions.forEach(q => { if (q) flat.push(q); });
    } else {
      flat.push(item);
    }
  });
  return flat;
};

// استخراج فیلدهای عددی و جداول اقلام فرم
export const getNumericFieldsAndTables = (formQuestionsOrSections = []) => {
  const formQuestions = flattenFormQuestions(formQuestionsOrSections);
  const numericFields = [];
  const tableColumns = [];
  const tables = [];

  formQuestions.forEach(q => {
    if (q.type === 'number') {
      numericFields.push({
        id: q.id,
        label: q.label || q.id,
        unit: q.unit || '',
        token: `{${q.id}}`,
        displayToken: q.label || q.id
      });
    } else if (q.type === 'table' || q.type === 'repeater_grid') {
      tables.push({
        id: q.id,
        label: q.label || 'جدول اقلام'
      });
      const cols = Array.isArray(q.columns) ? q.columns : [];
      cols.forEach(col => {
        tableColumns.push({
          tableId: q.id,
          tableLabel: q.label || 'جدول',
          columnId: col.id,
          columnLabel: col.label || col.id,
          type: col.type || 'text',
          isNumeric: col.type === 'number' || col.type === 'calculated' || Boolean(col.includeInTotal)
        });
      });
    }
  });

  return { numericFields, tableColumns, tables };
};

// تطبیق انعطاف‌پذیر نام جدول/فیلد با پشتیبانی از شناسه و برچسب
const findKeyCaseInsensitive = (obj, target) => {
  if (!obj || typeof obj !== 'object' || !target) return null;
  if (Object.prototype.hasOwnProperty.call(obj, target)) return target;
  const lower = String(target).trim().toLowerCase();
  return Object.keys(obj).find(k => k.trim().toLowerCase() === lower) || null;
};

/**
 * ارزیابی امن فرمول یک سطر جدول اقلام (بدون eval)
 */
export const evaluateRowFormula = (formula, row = {}, allCols = []) => {
  if (!formula || typeof formula !== 'string' || !formula.trim()) return 0;
  try {
    const rowScope = {};
    if (row && typeof row === 'object') {
      Object.keys(row).forEach(k => {
        rowScope[k] = row[k];
      });
    }
    (allCols || []).forEach(c => {
      if (!c) return;
      const val = row ? row[c.id] : undefined;
      if (c.id) rowScope[c.id] = val;
      if (c.label) rowScope[c.label] = val;
    });
    const parser = new SafeMathParser(formula, rowScope);
    const res = parser.parse();
    if (isNaN(res) || !isFinite(res)) return 0;
    return Math.round(res * 10000) / 10000;
  } catch {
    return 0;
  }
};

/**
 * ارزیابی توابع روی جداول اقلام: SUM, AVG, COUNT, MIN, MAX
 */
export const evaluateTableFunction = (fnName, tableId, columnId, answers = {}, formQuestionsOrSections = null) => {
  const cleanTableId = String(tableId || '').replace(/^\{|\}$|^\[|\]$/g, '').trim();
  const flatQuestions = formQuestionsOrSections ? flattenFormQuestions(formQuestionsOrSections) : [];

  let resolvedTableKey = findKeyCaseInsensitive(answers, cleanTableId);
  let matchedTableQuestion = flatQuestions.find(q =>
    (q.type === 'table' || q.type === 'repeater_grid') &&
    (q.id === cleanTableId ||
      String(q.id || '').trim().toLowerCase() === cleanTableId.toLowerCase() ||
      String(q.label || '').trim().toLowerCase() === cleanTableId.toLowerCase() ||
      String(q.label || '').replace(/\s+/g, '').toLowerCase() === cleanTableId.replace(/\s+/g, '').toLowerCase())
  );

  if (!resolvedTableKey && matchedTableQuestion) {
    resolvedTableKey = findKeyCaseInsensitive(answers, matchedTableQuestion.id);
  }
  if (!matchedTableQuestion && resolvedTableKey) {
    matchedTableQuestion = flatQuestions.find(q => q.id === resolvedTableKey);
  }

  const rawRows = resolvedTableKey ? answers[resolvedTableKey] : [];
  let rows = [];
  if (Array.isArray(rawRows)) {
    rows = rawRows;
  } else if (typeof rawRows === 'string') {
    try {
      const parsed = JSON.parse(rawRows);
      if (Array.isArray(parsed)) rows = parsed;
    } catch {}
  }

  const cleanCol = columnId ? String(columnId).replace(/^\{|\}$|^\[|\]$/g, '').trim() : null;
  const tableCols = Array.isArray(matchedTableQuestion?.columns) ? matchedTableQuestion.columns : [];
  const matchedColDef = cleanCol
    ? tableCols.find(c =>
        c.id === cleanCol ||
        String(c.id || '').trim().toLowerCase() === cleanCol.toLowerCase() ||
        String(c.label || '').trim().toLowerCase() === cleanCol.toLowerCase() ||
        String(c.label || '').replace(/\s+/g, '').toLowerCase() === cleanCol.replace(/\s+/g, '').toLowerCase()
      )
    : null;
  const targetColId = matchedColDef?.id || cleanCol;

  if (fnName === 'COUNT') {
    if (!targetColId) return rows.length;
    return rows.filter(r => {
      if (!r || typeof r !== 'object') return false;
      const k = findKeyCaseInsensitive(r, targetColId);
      return k && r[k] !== undefined && r[k] !== null && String(r[k]).trim() !== '';
    }).length;
  }

  const values = rows.map(r => {
    if (!r || typeof r !== 'object') return 0;
    if (!targetColId) return 0;
    const k = findKeyCaseInsensitive(r, targetColId);
    const rawCell = k ? r[k] : undefined;
    if (matchedColDef?.type === 'calculated' && matchedColDef.formula && (rawCell === undefined || rawCell === null || rawCell === '')) {
      return evaluateRowFormula(matchedColDef.formula, r, tableCols);
    }
    return parseNumberSafe(rawCell);
  });

  if (values.length === 0) return 0;

  switch (fnName) {
    case 'SUM':
      return values.reduce((sum, v) => sum + v, 0);
    case 'AVG':
      return values.length > 0 ? (values.reduce((sum, v) => sum + v, 0) / values.length) : 0;
    case 'MIN':
      return values.length > 0 ? Math.min(...values) : 0;
    case 'MAX':
      return values.length > 0 ? Math.max(...values) : 0;
    default:
      return 0;
  }
};

/**
 * پارسر امن عبارات ریاضی و منطقی مبتنی بر Recursive Descent Parser
 * بدون استفاده از eval()
 */
export class SafeMathParser {
  constructor(expression, scope = {}, formQuestionsOrSections = null) {
    this.original = expression || '';
    this.scope = scope || {};
    this.formQuestions = formQuestionsOrSections ? flattenFormQuestions(formQuestionsOrSections) : null;
    this.pos = 0;
    this.tokens = [];
    this.tokenize();
  }

  tokenize() {
    let str = toEnglishDigits(this.original).trim();
    // جایگزینی کاراکترهای جداکننده فارسی
    str = str.replaceAll('،', ',').replaceAll('؛', ';').replaceAll('×', '*').replaceAll('÷', '/');

    const tokens = [];
    let i = 0;

    while (i < str.length) {
      const ch = str[i];

      // نادیده گرفتن فاصله‌ها
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // متغیرهای داخل براکت یا کروشه مانند {q_1} یا [q_1]
      if (ch === '{' || ch === '[') {
        const closeChar = ch === '{' ? '}' : ']';
        const start = i + 1;
        const end = str.indexOf(closeChar, start);
        if (end === -1) {
          throw new Error(`نماد پایان ${closeChar} برای متغیر یافت نشد.`);
        }
        const varName = str.substring(start, end).trim();
        tokens.push({ type: 'VAR', value: varName });
        i = end + 1;
        continue;
      }

      // عملگرهای منطقی و مقایسه‌ای دوتایی (==, !=, >=, <=, &&, ||)
      const twoChar = str.slice(i, i + 2);
      if (['==', '!=', '>=', '<='].includes(twoChar)) {
        tokens.push({ type: 'CMP', value: twoChar });
        i += 2;
        continue;
      }
      if (twoChar === '&&' || twoChar === '||') {
        tokens.push({ type: 'LOGIC', value: twoChar });
        i += 2;
        continue;
      }
      if (ch === '>' || ch === '<') {
        tokens.push({ type: 'CMP', value: ch });
        i++;
        continue;
      }

      // عملگرها و نمادها
      if ('+-*/%^(),'.includes(ch)) {
        tokens.push({ type: 'OP', value: ch });
        i++;
        continue;
      }

      // اعداد (اعشاری یا صحیح)
      if (/\d/.test(ch) || (ch === '.' && /\d/.test(str[i + 1]))) {
        let numStr = '';
        while (i < str.length && (/\d/.test(str[i]) || str[i] === '.')) {
          numStr += str[i];
          i++;
        }
        // اگر درصد بعد از عدد آمده باشد مانند 9%
        if (i < str.length && str[i] === '%') {
          tokens.push({ type: 'NUMBER', value: parseFloat(numStr) / 100 });
          i++;
        } else {
          tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        }
        continue;
      }

      // کلمات، نام توابع و متغیرهای ساده (مانند SUM, ROUND, q_price)
      if (/[a-zA-Z_\u0600-\u06FF]/.test(ch)) {
        let ident = '';
        while (i < str.length && /[a-zA-Z0-9_.\u0600-\u06FF]/.test(str[i])) {
          ident += str[i];
          i++;
        }
        tokens.push({ type: 'IDENT', value: ident });
        continue;
      }

      // نقطه جداکننده مستقل (مانند SUM({table}.{col}))
      if (ch === '.') {
        tokens.push({ type: 'OP', value: '.' });
        i++;
        continue;
      }

      throw new Error(`کاراکتر نامعتبر در فرمول: "${ch}"`);
    }

    this.tokens = tokens;
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos] || null;
  }

  consume() {
    return this.tokens[this.pos++];
  }

  expect(type, val = null) {
    const t = this.consume();
    if (!t) throw new Error('انتهای نامنتظره در فرمول.');
    if (t.type !== type || (val !== null && t.value !== val)) {
      throw new Error(`انتظار "${val || type}" وجود داشت اما "${t.value}" مشاهده شد.`);
    }
    return t;
  }

  parse() {
    if (this.tokens.length === 0) return 0;
    const res = this.parseExpression();
    if (this.pos < this.tokens.length) {
      throw new Error(`بخش اضافه پس از پایان فرمول: "${this.tokens[this.pos].value}"`);
    }
    return isNaN(res) ? 0 : res;
  }

  parseCondition() {
    if (this.tokens.length === 0) {
      throw new Error('عبارت شرطی اعتبارسنجی خالی است.');
    }
    const res = this.parseLogicalOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`بخش اضافه پس از پایان شرط: "${this.tokens[this.pos].value}"`);
    }
    if (!res.hasComparison) {
      throw new Error('عبارت شرطی باید شامل عملگر مقایسه‌ای (==, !=, >, <, >=, <=) باشد.');
    }
    return Boolean(res.value);
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.peek() && this.peek().type === 'LOGIC' && this.peek().value === '||') {
      this.consume();
      const right = this.parseLogicalAnd();
      left = {
        value: Boolean(left.value) || Boolean(right.value),
        hasComparison: left.hasComparison && right.hasComparison
      };
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseComparison();
    while (this.peek() && this.peek().type === 'LOGIC' && this.peek().value === '&&') {
      this.consume();
      const right = this.parseComparison();
      left = {
        value: Boolean(left.value) && Boolean(right.value),
        hasComparison: left.hasComparison && right.hasComparison
      };
    }
    return left;
  }

  parseComparison() {
    if (this.peek() && this.peek().type === 'OP' && this.peek().value === '(') {
      const savedPos = this.pos;
      try {
        this.consume();
        const inner = this.parseLogicalOr();
        if (inner.hasComparison && this.peek() && this.peek().type === 'OP' && this.peek().value === ')') {
          this.consume();
          const after = this.peek();
          if (!after || after.type === 'LOGIC' || (after.type === 'OP' && after.value === ')')) {
            return inner;
          }
        }
      } catch {
        // بازگشت برای ارزیابی پرانتز عددی
      }
      this.pos = savedPos;
    }

    const left = this.parseExpression();
    const cmpTok = this.peek();
    if (cmpTok && cmpTok.type === 'CMP') {
      const op = this.consume().value;
      const right = this.parseExpression();
      const diff = Math.abs(left - right);
      let matched = false;
      switch (op) {
        case '==':
          matched = diff <= 0.01;
          break;
        case '!=':
          matched = diff > 0.01;
          break;
        case '>':
          matched = left > right;
          break;
        case '<':
          matched = left < right;
          break;
        case '>=':
          matched = left >= right - 1e-9;
          break;
        case '<=':
          matched = left <= right + 1e-9;
          break;
        default:
          matched = false;
      }
      return { value: matched, hasComparison: true };
    }
    return { value: Boolean(left), hasComparison: false };
  }

  parseExpression() {
    let left = this.parseTerm();

    while (this.peek() && this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const right = this.parseTerm();
      if (op === '+') left += right;
      else left -= right;
    }
    return left;
  }

  parseTerm() {
    let left = this.parseFactor();

    while (this.peek() && this.peek().type === 'OP' && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
      const op = this.consume().value;
      const right = this.parseFactor();
      if (op === '*') {
        left *= right;
      } else if (op === '/') {
        left = right === 0 ? 0 : left / right;
      } else if (op === '%') {
        left = right === 0 ? 0 : left % right;
      }
    }
    return left;
  }

  parseFactor() {
    // توان (Power ^)
    const base = this.parseUnary();
    if (this.peek() && this.peek().type === 'OP' && this.peek().value === '^') {
      this.consume();
      const exponent = this.parseFactor();
      return Math.pow(base, exponent);
    }
    return base;
  }

  parseUnary() {
    if (this.peek() && this.peek().type === 'OP' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.consume().value;
      const val = this.parseUnary();
      return op === '-' ? -val : val;
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();
    if (!t) throw new Error('فرمول ناقص است یا مقداری وارد نشده است.');

    // عدد ثابت
    if (t.type === 'NUMBER') {
      this.consume();
      return t.value;
    }

    // پرانتز ( ... )
    if (t.type === 'OP' && t.value === '(') {
      this.consume();
      const val = this.parseExpression();
      this.expect('OP', ')');
      // اگر بعد از پرانتز درصد آمده باشد: (a + b)%
      if (this.peek() && this.peek().type === 'OP' && this.peek().value === '%') {
        this.consume();
        return val / 100;
      }
      return val;
    }

    // متغیر درون آکولاد یا کروشه
    if (t.type === 'VAR') {
      this.consume();
      return this.resolveVariable(t.value);
    }

    // توابع یا متغیرهای ساده
    if (t.type === 'IDENT') {
      const name = this.consume().value;
      const upperName = name.toUpperCase();

      // آیا فراخوانی تابع است؟
      if (this.peek() && this.peek().type === 'OP' && this.peek().value === '(') {
        return this.parseFunctionCall(upperName);
      }

      // متغیر بدون براکت
      return this.resolveVariable(name);
    }

    throw new Error(`عبارت نامعتبر در موقعیت: "${t.value}"`);
  }

  parseFunctionCall(fnName) {
    this.expect('OP', '(');
    const args = [];

    // اگر پرانتز خالی نباشد
    if (!(this.peek() && this.peek().type === 'OP' && this.peek().value === ')')) {
      while (true) {
        // برای توابع جدولی مانند SUM(table.col)، آرگومان می‌تواند یک شناسه جدول باشد
        if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(fnName) && args.length === 0) {
          let refStr = '';
          while (this.peek() && !(this.peek().type === 'OP' && (this.peek().value === ',' || this.peek().value === ')'))) {
            const nextTok = this.consume();
            refStr += nextTok.value;
          }
          args.push(refStr);
        } else {
          args.push(this.parseExpression());
        }

        if (this.peek() && this.peek().type === 'OP' && this.peek().value === ',') {
          this.consume();
          continue;
        }
        break;
      }
    }

    this.expect('OP', ')');

    // اجرای تابع
    if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'].includes(fnName)) {
      const ref = String(args[0] || '').trim();
      let tableId = ref;
      let colId = '';
      if (ref.includes('.')) {
        const parts = ref.split('.');
        tableId = parts[0].trim();
        colId = parts[1].trim();
      }
      return evaluateTableFunction(fnName, tableId, colId, this.scope, this.formQuestions);
    }

    if (fnName === 'ROUND') {
      const val = Number(args[0]) || 0;
      const decimals = Math.max(0, Math.min(6, Number(args[1]) || 0));
      return Number(val.toFixed(decimals));
    }

    if (fnName === 'ABS') {
      return Math.abs(Number(args[0]) || 0);
    }

    if (fnName === 'FLOOR') {
      return Math.floor(Number(args[0]) || 0);
    }

    if (fnName === 'CEIL') {
      return Math.ceil(Number(args[0]) || 0);
    }

    throw new Error(`تابع ناشناخته: "${fnName}"`);
  }

  resolveVariable(varName) {
    if (!varName) return 0;
    const cleanName = varName.replace(/^\{|\}$|^\[|\]$/g, '').trim();

    // ۱. بررسی مستقیم در scope با شناسه
    if (this.scope[cleanName] !== undefined && this.scope[cleanName] !== null) {
      return parseNumberSafe(this.scope[cleanName]);
    }

    // ۲. بررسی در scope با تطبیق غیرحساس به حروف
    const foundKey = Object.keys(this.scope).find(k => k.trim().toLowerCase() === cleanName.toLowerCase());
    if (foundKey && this.scope[foundKey] !== undefined) {
      return parseNumberSafe(this.scope[foundKey]);
    }

    // ۳. تطبیق با برچسب فیلدها در صورت ارسال اسکیما فرم
    if (this.formQuestions && this.formQuestions.length > 0) {
      const matchedQ = this.formQuestions.find(q =>
        String(q.label || '').trim().toLowerCase() === cleanName.toLowerCase()
      );
      if (matchedQ && this.scope[matchedQ.id] !== undefined && this.scope[matchedQ.id] !== null) {
        return parseNumberSafe(this.scope[matchedQ.id]);
      }
    }

    // در صورتی که داده‌ای نباشد (مثلاً در پیش‌نمایش یا فیلد خالی)، مقدار صفر برمی‌گرداند
    return 0;
  }
}

/**
 * ارزیابی یک شرط اعتبارسنجی فرمولی (بدون eval، همراه با تلورانس 0.01 برای == و !=)
 * @returns {{ isValid: boolean, error: string | null }}
 */
export const evaluateValidationFormula = (expression, answers = {}, formQuestionsOrSections = null) => {
  if (!expression || typeof expression !== 'string' || !expression.trim()) {
    return { isValid: true, error: null };
  }
  try {
    const parser = new SafeMathParser(expression, answers, formQuestionsOrSections);
    const isValid = parser.parseCondition();
    return { isValid: Boolean(isValid), error: null };
  } catch (err) {
    return {
      isValid: false,
      error: err.message || 'سینتکس شرط فرمول نامعتبر است.'
    };
  }
};

/**
 * ارزیابی لیست قوانین اعتبارسنجی فرم
 * @returns {{ hasRules: boolean, isValid: boolean, failedRules: Array }}
 */
export const evaluateValidationRules = (rules = [], answers = {}, formQuestionsOrSections = null) => {
  const activeRules = (Array.isArray(rules) ? rules : []).filter(
    r => r && typeof r.formula === 'string' && r.formula.trim() !== ''
  );

  if (activeRules.length === 0) {
    return { hasRules: false, isValid: true, failedRules: [] };
  }

  const failedRules = [];
  activeRules.forEach((rule, idx) => {
    const res = evaluateValidationFormula(rule.formula, answers, formQuestionsOrSections);
    if (!res.isValid) {
      failedRules.push({
        id: rule.id || `rule_${idx}`,
        formula: rule.formula,
        errorMessage: (rule.errorMessage && rule.errorMessage.trim())
          ? rule.errorMessage.trim()
          : (res.error ? `خطا در قانون اعتبارسنجی: ${res.error}` : 'شرط اعتبارسنجی فرمولی فرم برقرار نیست.'),
        syntaxError: res.error
      });
    }
  });

  return {
    hasRules: true,
    isValid: failedRules.length === 0,
    failedRules
  };
};

/**
 * تابع ارزیابی کلی فرمول
 * @param {string} formula رشته فرمول
 * @param {object} answers مقادیر پاسخ‌های فرم
 * @returns {{ result: number, formatted: string, error: string | null }}
 */
export const evaluateFormula = (formula, answers = {}, boxSettings = {}, formQuestionsOrSections = null) => {
  if (!formula || typeof formula !== 'string' || !formula.trim()) {
    return { result: 0, formatted: '۰', error: null };
  }

  try {
    const parser = new SafeMathParser(formula, answers, formQuestionsOrSections);
    let val = parser.parse();

    if (isNaN(val) || !isFinite(val)) {
      val = 0;
    }

    const decimals = boxSettings.decimals !== undefined ? Math.max(0, Math.min(4, Number(boxSettings.decimals))) : 0;
    const useGrouping = boxSettings.useGrouping !== false;
    const unit = boxSettings.unit ? ` ${boxSettings.unit.trim()}` : '';

    const rounded = Number(val.toFixed(decimals));

    // فرمت‌بندی خروجی با جداکننده سه‌رقمی
    let formattedNumber = '';
    if (useGrouping) {
      const parts = rounded.toFixed(decimals).split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      formattedNumber = parts.join('.');
    } else {
      formattedNumber = rounded.toFixed(decimals);
    }

    return {
      result: rounded,
      formatted: `${formattedNumber}${unit}`,
      error: null
    };
  } catch (err) {
    return {
      result: 0,
      formatted: 'خطا در فرمول',
      error: err.message || 'سینتکس فرمول اشتباه است.'
    };
  }
};
