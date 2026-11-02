import type { Replay } from '../../types';

export function createReplay(overrides: Partial<Replay> = {}): Replay {
  return {
    id: 1,
    unit_id: 1,
    student_id: null,
    quadra: 'Quadra 1',
    b2_key_video: '1/Quadra 1/123.mp4',
    b2_key_thumb: '1/Quadra 1/123.jpg',
    duracao_seg: 120,
    created_at: new Date(),
    ...overrides,
  };
}
