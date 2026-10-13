import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Length, Min, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const SUPPORT_STATUSES = ['open', 'answered', 'closed'] as const;
export const SUPPORT_TOPICS = ['orders', 'returns', 'payments', 'products', 'account', 'other'] as const;
export type SupportTopicName = (typeof SUPPORT_TOPICS)[number];

export class TranscriptTurnDto {
  @IsIn(['user', 'assistant']) role!: 'user' | 'assistant';
  @IsString() @Length(1, 1000) content!: string;
}

export class CreateThreadDto {
  @Transform(trim) @IsString() @Length(1, 2000) message!: string;
  /** What the customer needs help with; decides which CSKH position sees it. Missing means "other". */
  @IsOptional() @IsIn(SUPPORT_TOPICS) topic?: SupportTopicName;
  /** The bot chat that led here, so the staff do not have to ask again. */
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => TranscriptTurnDto) transcript?: TranscriptTurnDto[];
}

export class MessageDto {
  @Transform(trim) @IsString() @Length(1, 2000) body!: string;
}

export class AfterQuery {
  /** Only return messages with a higher id; used to poll for new ones. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) after?: number;
}

export class StaffThreadsQuery {
  @IsOptional() @IsIn(SUPPORT_STATUSES) status?: (typeof SUPPORT_STATUSES)[number];
  /** One topic, or "mine" for the topics of the signed-in staff member (every topic when they have none). */
  @IsOptional() @IsIn([...SUPPORT_TOPICS, 'mine']) topic?: SupportTopicName | 'mine';
}

export class TopicDto {
  @IsIn(SUPPORT_TOPICS) topic!: SupportTopicName;
}
