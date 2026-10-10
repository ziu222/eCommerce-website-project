/** Lowercase and strip accents so "Đổi trả" and "doi tra" are the same text. */
export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

/** Folded alphanumeric words, in order. */
export function tokens(s: string): string[] {
  return fold(s).match(/[a-z0-9]+/g) ?? [];
}

const STOPWORDS = new Set(
  (
    'the a an is are was were do does did can could would should will i my me we you your it its this that these those ' +
    'how what when where which who whom why to of for and or in on at by with from be been if there have has had about ' +
    'please tell also any some so as not no ' +
    'toi minh em anh chi ban la va cho cua nhu the nao co khong duoc de can ve gi thi bao nhieu o dau sao lam voi nay ' +
    'kia mot cac nhung hay xin vui long a oi ha nha'
  ).split(' '),
);

const MAX_TERMS = 12;

/** Words worth searching for: no filler, and nothing but [a-z0-9], so they can go straight into a tsquery. */
export function searchTerms(question: string): string[] {
  const seen = new Set<string>();
  for (const t of tokens(question)) {
    if (t.length >= 2 && !STOPWORDS.has(t)) seen.add(t);
    if (seen.size === MAX_TERMS) break;
  }
  return [...seen];
}
