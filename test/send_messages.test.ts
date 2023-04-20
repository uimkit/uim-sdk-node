import { buildClient } from './client';
import { createReadStream, readFileSync } from 'fs';

describe('send_messages', () => {
  jest.setTimeout(300000);
  const client = buildClient();

  // it('send text message to conversation', async () => {
  //   const sendReq = client.createTextMessage({
  //     conversation_id: 'zGnJQvCkhcZvri4G_DVSa',
  //     text: '我在的',
  //   });
  //   const messageId = sendReq.id;
  //   console.log('message id: %s', messageId);
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  //   expect(message.id).toBe(messageId);
  // });

  // it('send text message to contact', async () => {
  //   const sendReq = client.createTextMessage({
  //     from: 'gmtIYyV1ovBPegHPVNOKO',
  //     to: 'JE_6WV5MK7wSpxiarPL9y',
  //     text: '应该可以了',
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });

  // it('send text message to group', async () => {
  //   const sendReq = client.createTextMessage({
  //     from: 'JTtg4oIp8R-rdWAIvmA2x',
  //     to: 'fnj4eTovvjF4trcChJd_f',
  //     text: '应该可以了',
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });

  // it('send text message to group mention users', async () => {
  //   const sendReq = client.createTextMessage({
  //     from: 'Rm4ZoV9W6t9c9dv_4fOE2',
  //     to: 'mZ1d0MJAYxGKN-zocqc5e',
  //     text: '@许盛 你在干嘛啊，回答一下@AI连接未来 ， 等急了@咚咚锵锵',
  //     mentioned_users: ["IG54juwUcGbt4AF4RFL90", "Rm4ZoV9W6t9c9dv_4fOE2", "viPUTAXCxMvBGMhpX5q1b"]
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });

  // it('send image message to conversation', async () => {
  //   const sendReq = client.createImageMessage({
  //     conversation_id: 'dtHhdHwjSZ56qxdADL8q3',
  //     file: 'test/resources/test_image.jpeg',
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });

  it('send video message to conversation', async () => {
    const sendReq = client.createVideoMessage({
      conversation_id: 'dtHhdHwjSZ56qxdADL8q3',
      file: 'test/resources/test_video.mp4',
      on_progress: (percent) => {
        console.log('upload progress: ' + percent);
      },
    });
    const message = await client.sendMessage(sendReq);
    console.log(JSON.stringify(message, undefined, 4));
  });

  // it('send audio message to conversation', async () => {
  //   const sendReq = client.createAudioMessage({
  //     conversation_id: 'YwHwFhGk9iZawmbvD4cKq',
  //     file: 'test/resources/test_audio.m4a',
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });

  // it('send image buffer to conversation', async () => {
  //   const buf = readFileSync('test/resources/test_audio.m4a');
  //   const sendReq = client.createAudioMessage({
  //     conversation_id: '2BzIjJZ0uT_IjnxmT7koD',
  //     file: buf,
  //     file_name: 'test_audio.m4a',
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });

  // it('send image stream to conversation', async () => {
  //   const stream = createReadStream('test/resources/test_audio.m4a');
  //   const sendReq = client.createAudioMessage({
  //     conversation_id: '2BzIjJZ0uT_IjnxmT7koD',
  //     file: stream,
  //     // file_name: 'test_audio.m4a'
  //   });
  //   const message = await client.sendMessage(sendReq);
  //   console.log(JSON.stringify(message, undefined, 4));
  // });
});
