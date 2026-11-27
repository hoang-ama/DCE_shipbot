import { validateRideBooking } from './flows/ride/validate';
import { validateRentalBooking } from './flows/rental/validate';
import type { PassengerBooking, RideBooking, RentalBooking } from './types';
import { matchPassengerPartner, readMockOpsProfile } from './partnerMatcher';

export interface PassengerAgentTurnInput {
  event: 'message' | 'booking_ready';
  message?: string;
  booking?: PassengerBooking;
}

export interface PassengerAgentTurnResult {
  reply: string;
  handover: boolean;
  opsProfile?: Record<string, unknown>;
  partner?: Awaited<ReturnType<typeof matchPassengerPartner>>['partner'];
  retrieval?: Awaited<ReturnType<typeof matchPassengerPartner>>['retrieval'];
  trace: Array<{ step: string; status: 'ok' | 'skip' | 'error'; detail?: unknown }>;
}

const opsRequestPattern = /(?:gặp|nói chuyện với|gọi|chuyển(?:s*(?:cho|sang))?|cần)\s*(?:ops|nhân viên|tư vấn viên|người thật|điều phối)|\bops\b/i;

function validationFor(booking: PassengerBooking) {
  return booking.flow === 'ride'
    ? validateRideBooking(booking as RideBooking)
    : validateRentalBooking(booking as RentalBooking);
}

export async function runPassengerAgentTurn(input: PassengerAgentTurnInput): Promise<PassengerAgentTurnResult> {
  const message = String(input.message || '').trim();
  const trace: PassengerAgentTurnResult['trace'] = [{ step: 'passenger_agent', status: 'ok', detail: { event: input.event } }];

  if (input.event === 'message' && opsRequestPattern.test(message)) {
    const opsProfile = await readMockOpsProfile();
    trace.push({ step: 'ops_handover', status: 'ok', detail: { opsId: opsProfile.id, mock: true } });
    return {
      reply: 'Em đã chuyển cuộc trò chuyện cho điều phối viên để hỗ trợ anh/chị trực tiếp. Anh/chị chờ em một chút nhé.',
      handover: true,
      opsProfile,
      trace,
    };
  }

  if (input.event === 'booking_ready' && input.booking) {
    const validation = validationFor(input.booking);
    if (!validation.isComplete) {
      const next = validation.missingFields[0] || 'thông tin còn thiếu';
      return {
        reply: `Em chưa thể tìm đối tác vì còn thiếu ${next}. Anh/chị bổ sung giúp em nhé.`,
        handover: false,
        trace: [...trace, { step: 'booking_validation', status: 'skip', detail: { missingFields: validation.missingFields } }],
      };
    }

    const result = await matchPassengerPartner(input.booking);
    trace.push({ step: 'partner_match_function', status: result.partner ? 'ok' : 'skip', detail: result.retrieval });
    if (!result.partner) {
      const opsProfile = await readMockOpsProfile();
      return {
        reply: 'Em chưa tìm được đối tác phù hợp với số lượng hành khách và yêu cầu này. Em chuyển anh/chị sang điều phối viên để hỗ trợ tiếp nhé.',
        handover: true,
        opsProfile,
        retrieval: result.retrieval,
        trace: [...trace, { step: 'ops_handover', status: 'ok', detail: { reason: 'NO_ELIGIBLE_PARTNER', opsId: opsProfile.id } }],
      };
    }

    const partner = result.partner;
    return {
      reply: `Em đã tìm được đối tác phù hợp: ${partner.displayName}, xe ${partner.vehicle.make} ${partner.vehicle.model} (${partner.vehicle.category}), tối đa ${partner.maxPassengers} hành khách. Đây là kết quả ghép đối tác thử nghiệm; chưa gửi yêu cầu thật.`,
      handover: false,
      partner,
      retrieval: result.retrieval,
      trace,
    };
  }

  return {
    reply: 'Anh/chị mô tả nhu cầu đi xe bằng lời tự nhiên giúp em nhé: điểm đón, điểm đến hoặc lịch trình, thời gian và số người đi. Nếu cần hỗ trợ trực tiếp, anh/chị có thể nhắn muốn gặp điều phối viên.',
    handover: false,
    trace: [...trace, { step: 'collect_booking_details', status: 'ok' }],
  };
}
