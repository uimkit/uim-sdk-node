import { buildClient } from './client';

describe('webhooks', () => {
  const client = buildClient();

  it('verify', async () => {
    let result = client.verifyWebhook(`{"type":"uim/conversation_updated","data":{"account":"JTtg4oIp8R-rdWAIvmA2x","active_at":1680274145107,"created_at":1668095818476,"id":"kixVL6qOfz9xLcPe_xzpA","last_message":{"account":"JTtg4oIp8R-rdWAIvmA2x","avatar":"http://wx.qlogo.cn/mmhead/ver_1/jWc0WDia89GyLEIz0kuwwcqazIHWhia8kcchtM9gYg2pjiaCw4Y5xReaicPmtB1aIJIDCaQSk7pGPNt1EHgqpMrHvA/0","conversation_id":"kixVL6qOfz9xLcPe_xzpA","conversation_type":"private","created_at":1680274145107,"flow":"in","from":"NemirNmGN7a7Ml0JpLBQt","id":"7lu7H7GNUbJW2jXOV1hKI","nickname":"许盛","provider":"wechat","revoked":false,"sent_at":1680274145107,"seq":135,"status":"success","text":"在不","to":"JTtg4oIp8R-rdWAIvmA2x","type":"text","updated_at":1680274145107},"pinned":false,"provider":"wechat","type":"private","unread":1,"updated_at":1680274145111}}`, "6f17421ce761e60bae31cffa8de1473924060f90b546a758b6057261fe243c81")
    expect(result).toBe(true)

    result = client.verifyWebhook(`{"data":{"account":"JTtg4oIp8R-rdWAIvmA2x","active_at":1680274145107,"created_at":1668095818476,"id":"kixVL6qOfz9xLcPe_xzpA","last_message":{"account":"JTtg4oIp8R-rdWAIvmA2x","avatar":"http://wx.qlogo.cn/mmhead/ver_1/jWc0WDia89GyLEIz0kuwwcqazIHWhia8kcchtM9gYg2pjiaCw4Y5xReaicPmtB1aIJIDCaQSk7pGPNt1EHgqpMrHvA/0","conversation_id":"kixVL6qOfz9xLcPe_xzpA","conversation_type":"private","created_at":1680274145107,"flow":"in","from":"NemirNmGN7a7Ml0JpLBQt","id":"7lu7H7GNUbJW2jXOV1hKI","nickname":"许盛","provider":"wechat","revoked":false,"sent_at":1680274145107,"seq":135,"status":"success","text":"在不","to":"JTtg4oIp8R-rdWAIvmA2x","type":"text","updated_at":1680274145107},"pinned":false,"provider":"wechat","type":"private","unread":1,"updated_at":1680274145111}}`, "6f17421ce761e60bae31cffa8de1473924060f90b546a758b6057261fe243c81")
    expect(result).toBe(false)
  });
});
