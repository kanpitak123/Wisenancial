import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookSessionDto } from './dto/book-session.dto';

export interface CoachDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  headline: { en: string; th: string };
  bio: { en: string; th: string };
  specialties: string[];
  rating: number;
  reviewCount: number;
  yearsExperience: number;
  hourlyRateThb: number;
  languages: string[];
  availableSlots: string[];
}

export interface CoachReviewDto {
  id: string;
  coachId: string;
  author: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface CoachSessionDto {
  id: string;
  coachId: string;
  coachName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
  topic: string;
  meetingUrl: string | null;
}

@Injectable()
export class CoachService {
  private readonly logger = new Logger(CoachService.name);
  private seeded = false;

  constructor(private readonly prisma: PrismaService) {}

  private isoInDays(days: number, hour = 10): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  /**
   * Idempotently seed production-structured coach data on first access so the
   * feature is fully usable without a manual seed step.
   * TODO(data): move this into prisma/seed-coaches.ts and run via `prisma db seed`.
   */
  private async ensureSeeded(): Promise<void> {
    if (this.seeded) return;

    const count = await this.prisma.coaches.count();
    if (count > 0) {
      this.seeded = true;
      return;
    }

    this.logger.log('Seeding coach data...');

    const coach1 = await this.prisma.coaches.create({
      data: {
        name: 'Anan Wattana',
        headline_en: 'Ex-prop desk trader, 12 years in SET & US equities',
        headline_th:
          'อดีตเทรดเดอร์ prop desk ประสบการณ์ 12 ปีในตลาด SET และหุ้นสหรัฐฯ',
        bio_en:
          'I help discretionary traders build repeatable, rules-based systems and fix the psychology leaks that cost them money.',
        bio_th:
          'ผมช่วยเทรดเดอร์สร้างระบบที่มีกฎชัดเจนและแก้ปัญหาด้านจิตวิทยาที่ทำให้ขาดทุน',
        specialties: ['DAY_TRADING', 'PSYCHOLOGY', 'RISK_MANAGEMENT'],
        rating: 4.9,
        review_count: 128,
        years_experience: 12,
        hourly_rate_thb: 1500,
        languages: ['th', 'en'],
        availability: {
          create: [
            { slot: this.isoInDays(1) },
            { slot: this.isoInDays(2, 14) },
            { slot: this.isoInDays(3, 11) },
            { slot: this.isoInDays(5, 16) },
          ],
        },
        reviews: {
          create: [
            { author: 'Tom P.', rating: 5, comment: 'Completely changed how I size my positions.' },
            { author: 'May S.', rating: 5, comment: 'Helped me stop revenge trading.' },
          ],
        },
      },
    });

    const coach2 = await this.prisma.coaches.create({
      data: {
        name: 'Sarah Chen',
        headline_en: 'Options strategist & volatility specialist',
        headline_th: 'นักกลยุทธ์ออปชันและผู้เชี่ยวชาญด้านความผันผวน',
        bio_en:
          'CFA charterholder focused on income strategies, spreads, and managing tail risk for retail portfolios.',
        bio_th:
          'ผู้ถือใบอนุญาต CFA เน้นกลยุทธ์สร้างรายได้ สเปรด และการจัดการความเสี่ยง',
        specialties: ['OPTIONS', 'RISK_MANAGEMENT'],
        rating: 4.8,
        review_count: 86,
        years_experience: 9,
        hourly_rate_thb: 2200,
        languages: ['en'],
        availability: {
          create: [
            { slot: this.isoInDays(2, 9) },
            { slot: this.isoInDays(4, 13) },
            { slot: this.isoInDays(6, 10) },
          ],
        },
        reviews: {
          create: [
            { author: 'Alex W.', rating: 5, comment: 'Finally understand spreads. Worth every baht.' },
          ],
        },
      },
    });

    const coach3 = await this.prisma.coaches.create({
      data: {
        name: 'Krit Boonmee',
        headline_en: 'Long-term value investor, dividend growth focus',
        headline_th: 'นักลงทุนเน้นคุณค่าระยะยาว เน้นหุ้นปันผลเติบโต',
        bio_en:
          'I coach beginners on fundamentals, valuation, and building a portfolio you can hold through cycles.',
        bio_th: 'ผมสอนพื้นฐาน การประเมินมูลค่า และการสร้างพอร์ตที่ถือได้ยาว',
        specialties: ['VALUE_INVESTING', 'SWING_TRADING'],
        rating: 4.7,
        review_count: 54,
        years_experience: 15,
        hourly_rate_thb: 1200,
        languages: ['th', 'en'],
        availability: {
          create: [
            { slot: this.isoInDays(1, 15) },
            { slot: this.isoInDays(3, 9) },
            { slot: this.isoInDays(7, 11) },
          ],
        },
        reviews: {
          create: [
            { author: 'Nok T.', rating: 4, comment: 'Patient and clear with fundamentals.' },
          ],
        },
      },
    });

    this.logger.log(
      `Seeded coaches: ${coach1.id}, ${coach2.id}, ${coach3.id}`,
    );
    this.seeded = true;
  }

  async listCoaches(): Promise<CoachDto[]> {
    await this.ensureSeeded();
    const coaches = await this.prisma.coaches.findMany({
      where: { is_active: true },
      include: {
        availability: {
          where: { is_booked: false, slot: { gte: new Date() } },
          orderBy: { slot: 'asc' },
        },
      },
      orderBy: { rating: 'desc' },
    });

    return coaches.map((c) => this.toCoachDto(c));
  }

  async getCoach(id: string): Promise<CoachDto> {
    await this.ensureSeeded();
    const coach = await this.prisma.coaches.findUnique({
      where: { id: Number(id) },
      include: {
        availability: {
          where: { is_booked: false, slot: { gte: new Date() } },
          orderBy: { slot: 'asc' },
        },
      },
    });
    if (!coach) throw new NotFoundException(`Coach ${id} not found`);
    return this.toCoachDto(coach);
  }

  async getReviews(coachId: string): Promise<CoachReviewDto[]> {
    await this.ensureSeeded();
    const reviews = await this.prisma.coach_reviews.findMany({
      where: { coach_id: Number(coachId) },
      orderBy: { created_at: 'desc' },
    });
    return reviews.map((r) => ({
      id: String(r.id),
      coachId: String(r.coach_id),
      author: r.author,
      rating: r.rating,
      comment: r.comment,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async mySessions(userId: number): Promise<CoachSessionDto[]> {
    const sessions = await this.prisma.coach_sessions.findMany({
      where: { user_id: userId },
      include: { coaches: true },
      orderBy: { scheduled_at: 'asc' },
    });
    return sessions.map((s) => this.toSessionDto(s, s.coaches.name));
  }

  async bookSession(
    userId: number,
    dto: BookSessionDto,
  ): Promise<CoachSessionDto> {
    await this.ensureSeeded();
    const coachId = Number(dto.coachId);
    const coach = await this.prisma.coaches.findUnique({
      where: { id: coachId },
    });
    if (!coach) throw new NotFoundException(`Coach ${dto.coachId} not found`);

    const slotDate = new Date(dto.slot);

    // Mark the availability slot booked if it exists (best-effort).
    await this.prisma.coach_availability.updateMany({
      where: { coach_id: coachId, slot: slotDate, is_booked: false },
      data: { is_booked: true },
    });

    const session = await this.prisma.coach_sessions.create({
      data: {
        coach_id: coachId,
        user_id: userId,
        scheduled_at: slotDate,
        duration_minutes: 60,
        status: 'UPCOMING',
        topic: dto.topic?.trim() || 'General coaching',
        // TODO(integration): generate a real video meeting link (e.g. Daily,
        // Zoom, or Google Meet API) once a provider is configured.
        meeting_url: null,
      },
    });

    return this.toSessionDto(session, coach.name);
  }

  async cancelSession(
    userId: number,
    sessionId: string,
  ): Promise<CoachSessionDto> {
    const session = await this.prisma.coach_sessions.findFirst({
      where: { id: Number(sessionId), user_id: userId },
      include: { coaches: true },
    });
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);

    const updated = await this.prisma.coach_sessions.update({
      where: { id: session.id },
      data: { status: 'CANCELLED' },
      include: { coaches: true },
    });

    // Free the slot back up.
    await this.prisma.coach_availability.updateMany({
      where: { coach_id: session.coach_id, slot: session.scheduled_at },
      data: { is_booked: false },
    });

    return this.toSessionDto(updated, updated.coaches.name);
  }

  private toCoachDto(coach: {
    id: number;
    name: string;
    avatar_url: string | null;
    headline_en: string;
    headline_th: string;
    bio_en: string;
    bio_th: string;
    specialties: string[];
    rating: { toNumber: () => number } | number;
    review_count: number;
    years_experience: number;
    hourly_rate_thb: number;
    languages: string[];
    availability?: { slot: Date }[];
  }): CoachDto {
    return {
      id: String(coach.id),
      name: coach.name,
      avatarUrl: coach.avatar_url,
      headline: { en: coach.headline_en, th: coach.headline_th },
      bio: { en: coach.bio_en, th: coach.bio_th },
      specialties: coach.specialties,
      rating:
        typeof coach.rating === 'number'
          ? coach.rating
          : coach.rating.toNumber(),
      reviewCount: coach.review_count,
      yearsExperience: coach.years_experience,
      hourlyRateThb: coach.hourly_rate_thb,
      languages: coach.languages,
      availableSlots: (coach.availability ?? []).map((a) => a.slot.toISOString()),
    };
  }

  private toSessionDto(
    session: {
      id: number;
      coach_id: number;
      scheduled_at: Date;
      duration_minutes: number;
      status: 'UPCOMING' | 'COMPLETED' | 'CANCELLED';
      topic: string | null;
      meeting_url: string | null;
    },
    coachName: string,
  ): CoachSessionDto {
    return {
      id: String(session.id),
      coachId: String(session.coach_id),
      coachName,
      scheduledAt: session.scheduled_at.toISOString(),
      durationMinutes: session.duration_minutes,
      status: session.status,
      topic: session.topic ?? '',
      meetingUrl: session.meeting_url,
    };
  }
}
