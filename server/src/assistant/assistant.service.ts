import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../auth/session-user.js';
import { AnswerWriter, type ChatTurn } from './answer-writer.js';
import { ComparisonService, type Comparison } from './comparison.service.js';
import { KnowledgeService, type PolicyHit } from './knowledge.service.js';
import { fold, tokens } from './text.js';

export type BotAction = 'handoff' | 'login';

export interface BotReply {
  type: 'text' | 'comparison' | 'handoff' | 'login';
  text: string;
  sources?: { slug: string; title: string }[];
  comparison?: Comparison;
  actions?: BotAction[];
}

const WANTS_PERSON =
  /nhan vien|gap nguoi|nguoi that|tong dai|cskh|\bhuman\b|real person|live agent|customer service|\b(speak|talk|chat) (to|with) (a |an |the )?(person|human|agent|staff|someone|representative|support)/;
const ABOUT_AN_ORDER =
  /order\s*#?\s*\d+|#\d+|don\s*(hang)?\s*(so\s*)?#?\s*\d+|where is my (order|package|parcel)|track(ing)? my|don hang cua (toi|minh)/;
const WANTS_COMPARISON = /compar|versus|\bvs\b|so sanh|khac nhau|difference between/;

// Markers that make a short question clearly Vietnamese even when typed without accents.
const VIETNAMESE_WORDS = new Set('toi minh ban khong doi tra giao hang bao lau nhu nao hoi phi thanh toan huy don vi ma giam gia bao hanh nhan vien cho'.split(' '));

function looksVietnamese(question: string): boolean {
  return /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(question) || tokens(question).some((w) => VIETNAMESE_WORDS.has(w));
}

/** Policy bodies hold the English and Vietnamese text separated by " | ". */
function policyText(policy: PolicyHit, vietnamese: boolean): string {
  const [english, vietnameseText] = policy.body.split(' | ');
  return vietnamese && vietnameseText ? vietnameseText : english;
}

const COPY = {
  en: {
    handoff: 'Sure, I will pass you to our support team. Leave your message and they will reply here as soon as they can.',
    login: 'To talk to our staff, please sign in first so they can see who you are and reply to you here.',
    orderHandoff: 'I cannot see order details myself, but our support staff can. Leave them a message with your order number.',
    orderLogin: 'I cannot see order details myself. Please sign in, then leave a message for our support staff with your order number.',
    unsure: 'I am not sure about that. Our support staff can help.',
    needTwo: (found: string) => `${found}To compare, name at least two products, for example "iPhone 17 Pro vs Galaxy S25 Ultra".`,
    compared: 'Here is how they compare. Prices and stock are live.',
  },
  vi: {
    handoff: 'Được ạ, mình sẽ chuyển bạn cho đội hỗ trợ. Hãy để lại tin nhắn, nhân viên sẽ trả lời ngay tại đây sớm nhất có thể.',
    login: 'Để gặp nhân viên, bạn vui lòng đăng nhập trước để họ biết bạn là ai và trả lời bạn tại đây.',
    orderHandoff: 'Mình không xem được chi tiết đơn hàng, nhưng nhân viên hỗ trợ thì có. Hãy để lại tin nhắn kèm mã đơn hàng.',
    orderLogin: 'Mình không xem được chi tiết đơn hàng. Bạn vui lòng đăng nhập rồi để lại tin nhắn kèm mã đơn hàng cho nhân viên hỗ trợ.',
    unsure: 'Mình chưa chắc về điều này. Nhân viên hỗ trợ có thể giúp bạn.',
    needTwo: (found: string) => `${found}Để so sánh, hãy nêu tên ít nhất hai sản phẩm, ví dụ "iPhone 17 Pro và Galaxy S25 Ultra".`,
    compared: 'Đây là bảng so sánh. Giá và tồn kho là dữ liệu hiện tại.',
  },
};

@Injectable()
export class AssistantService {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly comparison: ComparisonService,
    private readonly writer: AnswerWriter,
  ) {}

  /** `turns` ends with the customer's question. `viewer` is the signed-in user, if any. */
  async reply(turns: ChatTurn[], viewer: SessionUser | null): Promise<BotReply> {
    const question = turns[turns.length - 1].content.trim();
    const history = turns.slice(0, -1);
    const copy = looksVietnamese(question) ? COPY.vi : COPY.en;
    const vietnamese = copy === COPY.vi;
    const folded = fold(question);
    const customer = viewer?.role === 'customer';
    const staffAction: BotAction = customer ? 'handoff' : 'login';

    if (WANTS_PERSON.test(folded)) {
      return customer ? { type: 'handoff', text: copy.handoff } : { type: 'login', text: copy.login };
    }

    if (ABOUT_AN_ORDER.test(folded)) {
      return customer ? { type: 'handoff', text: copy.orderHandoff } : { type: 'login', text: copy.orderLogin };
    }

    const named = await this.comparison.find(question);
    if (named.length >= 2) {
      return { type: 'comparison', text: copy.compared, comparison: this.comparison.table(named) };
    }
    if (WANTS_COMPARISON.test(folded)) {
      const found = named.length ? (vietnamese ? `Mình thấy "${named[0].name}". ` : `I found "${named[0].name}". `) : '';
      return { type: 'text', text: copy.needTwo(found) };
    }

    const policies = await this.knowledge.search(question);
    if (!policies.length) return { type: 'text', text: copy.unsure, sources: [], actions: [staffAction] };

    const sources = policies.map((p) => ({ slug: p.slug, title: p.title }));
    const written = await this.writer.write(question, history, policies);
    return { type: 'text', text: written ?? policyText(policies[0], vietnamese), sources, actions: [staffAction] };
  }
}
