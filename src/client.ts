import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import EventEmitter from 'eventemitter3';
import { nanoid } from 'nanoid';
import { Logger, LogLevel, logLevelSeverity, makeConsoleLogger } from './logging';
import { fileExt, pick, omit, isReadableStream, isBuffer, isString } from './helpers';
import {
  GetAccountListParameters,
  GetAccountListResponse,
  GetContactListParameters,
  GetContactListResponse,
  GetGroupListParameters,
  GetGroupListResponse,
  GetConversationListParameters,
  GetConversationListResponse,
  GetGroupMemberListParameters,
  GetGroupMemberListResponse,
  GetMomentListResponse,
  GetMessageListParameters,
  GetMessageListResponse,
  AddContactParameters,
  AddContactResponse,
  GetAccountMomentListInboxParameters,
  GetUserMomentListParameters,
  CreateGroupParameters,
  TransferGroupParameters,
  GetFriendApplicationListParameters,
  GetFriendApplicationListResponse,
  InviteGroupMembersParameters,
  InviteGroupMembersResponse,
  SetGroupMemberRoleParameters,
  GetGroupApplicationListParameters,
  GetGruopApplicationListResponse,
  GetMomentCommentListParameters,
  GetCommentListResponse,
  CommentOnMomentParameters,
  SendMessageParameters,
  CreateMessageParameters,
  PublishMomentParameters,
  CreateMomentParameters,
  Attachment,
} from './types';
import { SupportedPubSub, default as PubSub } from './pubsub';
import { EventHandler, UIMEventType, UIMEvent } from './events';
import {
  Account,
  Contact,
  Group,
  GroupMember,
  Conversation,
  Message,
  MessageFlow,
  Comment,
  MessageStatus,
  MessageType,
  ImageMessagePayload,
  AudioMessagePayload,
  VideoMessagePayload,
  Moment,
  MomentType,
  ImageMomentContent,
  VideoMomentContent,
} from './models';
import { UploadOptions, UIMUploadPlugin, UploadPlugin } from './upload';
import { decodeBase64 } from './base64';
import { APIErrorResponse, ErrorFromResponse, isErrorResponse } from './errors';

/**
 * UIMClient 构造选项
 */
export interface UIMClientOptions {
  baseUrl?: string;
  subscribeKey?: string;
  timeoutMs?: number;
  logLevel?: LogLevel;
  axiosRequestConfig?: AxiosRequestConfig;
  upload?: UploadPlugin
}

export class UIMClient {
  private clientID: string;
  private clientSecret: string;
  private token: string;
  private logLevel: LogLevel;
  private logger: Logger;
  private baseUrl: string;
  private timeoutMs: number;
  private channels: Array<string>;
  private eventEmitter: EventEmitter;
  private axiosRequestConfig?: AxiosRequestConfig;
  private axiosInstance: AxiosInstance;
  private pubsub: SupportedPubSub;
  private uploadPlugin: UploadPlugin
  private userAgent?: string;
  private nextRequestAbortController: AbortController | null = null;

  public constructor(clientID: string, clientSecret: string, options?: UIMClientOptions) {
    this.clientID = clientID
    this.clientSecret = clientSecret
    this.token = "";
    this.logLevel = options?.logLevel ?? LogLevel.INFO;
    this.logger = makeConsoleLogger('uim-node');
    let baseUrl = options?.baseUrl ?? 'https://api.uimkit.chat/admin/v1'
    if (baseUrl.endsWith("/")) {
      baseUrl = baseUrl.slice(0, -1)
    }
    this.baseUrl = baseUrl;
    this.timeoutMs = options?.timeoutMs ?? 60_000;
    this.channels = [];
    this.eventEmitter = new EventEmitter();
    this.axiosRequestConfig = options?.axiosRequestConfig
    this.axiosInstance = axios.create({
      timeout: this.timeoutMs,
      baseURL: this.baseUrl
    });
    this.pubsub = new PubSub({
      uuid: this.clientID,
      subscribeKey: options?.subscribeKey ?? 'sub-c-ba96530f-177f-4fdb-8ab0-2e0108e0ea36',
      logVerbosity: this.logLevel === LogLevel.DEBUG,
    });
    this.pubsub.addListener(this.onEvent.bind(this));
    this.uploadPlugin = options?.upload ?? new UIMUploadPlugin(this.baseUrl, this.token)
  }

  /**
   * 账号退出登录
   *
   * @param {string} id 账号ID
   */
  public async logout(id: string) {
    await this.post(`/im_accounts/${id}/logout`)
    // 取消订阅账号
    if (this.channels.indexOf(id) >= 0) {
      this.pubsub.unsubscribe([id]);
    }
  }

  /**
   * 查询账号列表
   *
   * @param args
   * @returns
   */
  public async getAccountList(parameters: GetAccountListParameters): Promise<GetAccountListResponse> {
    const resp = await this.get<GetAccountListResponse>('/im_accounts', parameters)
    if (resp.data.length > 0) {
      // 只需要订阅之前没有订阅过的，账号id作为channel名字
      const channels = resp.data.map(it => it.id).filter(it => this.channels.indexOf(it) < 0);
      this.channels = [...channels, ...this.channels];
      this.pubsub.subscribe(this.channels);
    }
    return resp;
  }

  /**
   * 获取账号详情
   *
   * @param {string} id 账号ID
   * @param {boolean} subscribe 是否订阅账号的事件
   * @returns
   */
  public async getAccount(id: string, subscribe?: boolean): Promise<Account> {
    const account = await this.get<Account>(`/im_accounts/${id}`)
    if (subscribe) {
      // 注意不需要重复订阅
      const notSubscribed = this.channels.indexOf(account.id) < 0;
      if (notSubscribed) {
        this.channels = [account.id, ...this.channels];
        this.pubsub.subscribe(this.channels);
      }
    }
    return account;
  }

  /**
   * 查询好友列表
   *
   * @param parameters
   * @returns
   */
  public getContactList(parameters: GetContactListParameters): Promise<GetContactListResponse> {
    return this.get(`/im_accounts/${parameters.account_id}/contacts`, omit(parameters, ['account_id']))
  }

  /**
   * 获取好友详情
   *
   * @param {string} id 好友id
   * @returns
   */
  public getContact(id: string): Promise<Contact> {
    return this.get<Contact>(`/contacts/${id}`)
  }

  /**
   * 删除好友
   *
   * @param id
   */
  public async deleteContact(id: string) {
    return this.delete(`/contacts/${id}`)
  }

  /**
   * 设置/取消星标好友
   *
   * @param id 好友ID
   * @param marked 是否星标
   * @returns
   */
  public markContact(id: string, marked: boolean): Promise<Contact> {
    return this.post<Contact>(`/contacts/${id}/mark`, { marked })
  }

  /**
   * 添加好友
   *
   * @param parameters
   * @returns 返回好友申请发送结果，成功仅代表好友申请发送成功
   */
  public addContact(parameters: AddContactParameters): Promise<AddContactResponse> {
    return this.post<AddContactResponse>(`/im_accounts/${parameters.account_id}/contacts/add`, omit(parameters, ['account_id']))
  }

  /**
   * 查询账号的好友请求列表
   *
   * @param parameters
   * @returns
   */
  public getFriendApplicationList(
    parameters: GetFriendApplicationListParameters,
  ): Promise<GetFriendApplicationListResponse> {
    return this.get<GetFriendApplicationListResponse>(`/im_accounts/${parameters.account_id}/friend_applications`, omit(parameters, ['account_id']))
  }

  /**
   * 通过好友申请
   *
   * @param {string} application_id 好友申请ID
   */
  public async acceptFriendApplication(application_id: string) {
    await this.post(`/friend_applications/${application_id}/accept`)
  }

  /**
   * 查询群组列表
   *
   * @param parameters
   * @returns
   */
  public getGroupList(parameters: GetGroupListParameters): Promise<GetGroupListResponse> {
    return this.get<GetGroupListResponse>(`/im_accounts/${parameters.account_id}/groups`, omit(parameters, ['account_id']))
  }

  /**
   * 获取群组详情
   *
   * @param id
   * @returns
   */
  public getGroup(id: string): Promise<Group> {
    return this.get<Group>(`/groups/${id}`)
  }

  /**
   * 星标/取消星标群组
   *
   * @param id 群组ID
   * @param marked 是否星标
   * @returns
   */
  public markGroup(id: string, marked: boolean): Promise<Group> {
    return this.post<Group>(`/groups/${id}/mark`, { marked })
  }

  /**
   * 设置/取消群组禁言
   *
   * @param id 群组ID
   * @param mute 是否禁言
   * @returns
   */
  public setGroupMute(id: string, mute: boolean): Promise<Group> {
    return this.post<Group>(`/groups/${id}/mute`, { mute })
  }

  /**
   * 创建群组
   *
   * @param parameters
   */
  public createGroup(parameters: CreateGroupParameters): Promise<Group> {
    return this.post<Group>(`/im_accounts/${parameters.account_id}/groups`, omit(parameters, ['account_id']))
  }

  /**
   * TODO 申请加入群组
   */

  /**
   * 退出群组
   *
   * @param account_id
   * @param group_id
   */
  public async quitGroup(account_id: string, group_id: string) {
    await this.post(`/im_accounts/${account_id}/groups/${group_id}/quit`)
  }

  /**
   * 解散群组
   *
   * @param group_id
   * @returns
   */
  public async dismissGroup(group_id: string) {
    await this.post(`/groups/${group_id}/dismiss`)
  }

  /**
   * 转让群组
   *
   * @param parameters
   */
  public async transferGroup(parameters: TransferGroupParameters) {
    await this.post(`/groups/${parameters.group_id}/transfer`, omit(parameters, ['group_id']))
  }

  /**
   * 查询群成员列表
   *
   * @param parameters
   * @returns
   */
  public getGroupMemberList(parameters: GetGroupMemberListParameters): Promise<GetGroupMemberListResponse> {
    return this.get<GetGroupMemberListResponse>(`/groups/${parameters.group_id}/members`, omit(parameters, ['group_id']))
  }

  /**
   * 获取群成员详情
   *
   * @param member_id
   * @returns
   */
  public getGroupMember(member_id: string): Promise<GroupMember> {
    return this.get<GroupMember>(`/group_members/${member_id}`)
  }

  /**
   * 邀请好友加入群组
   *
   * @param parameters
   */
  public inviteGroupMembers(parameters: InviteGroupMembersParameters): Promise<InviteGroupMembersResponse> {
    return this.post<InviteGroupMembersResponse>(`/im_accounts/${parameters.account_id}/groups/${parameters.group_id}/invite`, omit(parameters, ['account_id', 'group_id']))
  }

  /**
   * 从群组踢出成员
   *
   * @param account_id
   * @param group_id
   * @param member_id
   */
  public async kickGroupMember(account_id: string, group_id: string, member_id: string) {
    return this.post<InviteGroupMembersResponse>(`/im_accounts/${account_id}/groups/${group_id}/members/${member_id}/kick`)
  }

  /**
   * 设置群成员角色
   *
   * @param parameters
   */
  public async setGroupMemberRole(parameters: SetGroupMemberRoleParameters) {
    await this.post(`/im_accounts/${parameters.account_id}/groups/${parameters.group_id}/members/${parameters.member_id}/set_role`, { role: parameters.role })
  }

  /**
   * 查询入群申请列表
   *
   * @param parameters
   * @returns
   */
  public getGroupApplicationList(
    parameters: GetGroupApplicationListParameters,
  ): Promise<GetGruopApplicationListResponse> {
    return this.get<GetGruopApplicationListResponse>(`/groups/${parameters.group_id}/group_applications`, omit(parameters, ['group_id']))
  }

  /**
   * 通过入群申请
   *
   * @param account_id
   * @param application_id
   */
  public async acceptGroupApplication(account_id: string, application_id: string) {
    await this.post(`/group_applications/${application_id}/accept`, { account_id })
  }

  /**
   * 查询会话列表
   *
   * @param parameters
   * @returns
   */
  public getConversationList(parameters: GetConversationListParameters): Promise<GetConversationListResponse> {
    return this.get<GetConversationListResponse>(`/im_accounts/${parameters.account_id}/conversations`, omit(parameters, ['account_id']))
  }

  /**
   * 获取会话详情
   *
   * @param id
   * @returns
   */
  public getConversation(id: string): Promise<Conversation> {
    return this.get<Conversation>(`/conversations/${id}`)
  }

  /**
   * 获取和好友的会话详情
   *
   * @param contact_id
   * @returns
   */
  public getContactConversation(contact_id: string): Promise<Conversation> {
    return this.get<Conversation>(`/contacts/${contact_id}/conversations`)
  }

  /**
   * 获取和群组的会话详情
   *
   * @param group_id
   * @returns
   */
  public getGroupConversation(group_id: string): Promise<Conversation> {
    return this.get<Conversation>(`/groups/${group_id}/conversations`)
  }

  /**
   * 设置会话所有消息已读
   *
   * @param id
   * @returns
   */
  public setConversationRead(id: string): Promise<Conversation> {
    return this.post<Conversation>(`/conversations/${id}/read`)
  }

  /**
   * 置顶/取消置顶会话
   *
   * @param id 会话ID
   * @param pinned 是否置顶
   * @returns
   */
  public pinConversation(id: string, pinned: boolean): Promise<Conversation> {
    return this.post<Conversation>(`/conversations/${id}/pin`, { pinned })
  }

  /**
   * 删除会话
   *
   * @param id
   */
  public async deleteConversation(id: string) {
    await this.delete(`/conversations/${id}`)
  }

  /**
   * 查询会话的消息列表
   *
   * @param args
   * @returns
   */
  public getMessageList(parameters: GetMessageListParameters): Promise<GetMessageListResponse> {
    return this.get<GetMessageListResponse>(`/conversations/${parameters.conversation_id}/messages`, omit(parameters, ['conversation_id']))
  }

  /**
   * 重发消息
   *
   * @param message_id
   * @returns
   */
  public resendMessage(message_id: string): Promise<Message> {
    return this.post('/resend_message', { message_id })
  }

  /**
   * 删除消息
   *
   * @param id
   */
  public async deleteMessage(id: string) {
    await this.delete(`/messages/${id}`)
  }

  /**
   * 查看账号收到的动态列表
   *
   * @param parameters
   * @returns
   */
  public getAccountMomentListInbox(parameters: GetAccountMomentListInboxParameters): Promise<GetMomentListResponse> {
    return this.get<GetMomentListResponse>(`/im_accounts/${parameters.account_id}/moments`)
  }

  /**
   * 查询用户发布的动态列表
   *
   * account_id 用于指定使用哪个账号来负责查询
   * user_id 用于指定发布用户
   * 如果查看账号自己发布的动态，那么 account_id 和 user_id 传同一个值即可
   *
   * @param parameters
   * @returns
   */
  public getUserMomentList(parameters: GetUserMomentListParameters): Promise<GetMomentListResponse> {
    return this.get<GetMomentListResponse>(`/im_accounts/${parameters.account_id}/moments`, omit(parameters, ['account_id']))
  }

  /**
   * 查询动态的评论列表
   *
   * @param parameters
   * @returns
   */
  public getMomentCommentList(parameters: GetMomentCommentListParameters): Promise<GetCommentListResponse> {
    return this.get<GetCommentListResponse>(`/moments/${parameters.moment_id}/comments`, omit(parameters, ['moment_id']))
  }

  /**
   * 对动态发表评论
   *
   * @param parameters
   * @returns
   */
  public commentOnMoment(parameters: CommentOnMomentParameters): Promise<Comment> {
    return this.post<Comment>(`/moments/${parameters.moment_id}/comments`, omit(parameters, ['moment_id']))
  }

  /**
   * 删除动态
   *
   * @param id
   */
  public async deleteMoment(id: string) {
    await this.delete(`/moments/${id}`)
  }

  /**
   * 发送消息
   *
   * @param parameters
   * @returns
   */
  public async sendMessage(parameters: SendMessageParameters): Promise<Message> {
    // 先上传文件
    if (parameters.file) {
      const options: UploadOptions = {
        onProgress: parameters.on_progress,
        message: parameters as Message,
      };

      let attachment: Attachment
      const { file, file_name: name } = parameters
      if (isReadableStream(file) || isBuffer(file)) {
        attachment = { file, name }
      } else if (isString(file)) {
        attachment = { file, name }
      } else {
        attachment = file as Attachment
      }

      const payload = await this.uploadPlugin.upload(attachment, options);

      switch (parameters.type) {
        case MessageType.Image: {
          parameters.image = payload as ImageMessagePayload;
          break;
        }
        case MessageType.Audio: {
          parameters.audio = payload as AudioMessagePayload;
          break;
        }
        case MessageType.Video: {
          parameters.video = payload as VideoMessagePayload;
          break;
        }
        default: {
          throw new Error('unsupported message type');
        }
      }
    }

    return this.post('/send_message', omit(parameters, ['file', 'on_progress']))
  }

  /**
   * 创建文本消息
   *
   * @param parameters
   * @returns
   */
  public createTextMessage(parameters: CreateMessageParameters): SendMessageParameters {
    if (!parameters.text) {
      throw new Error('must have text payload')
    }
    const message = pick(parameters, ['from', 'to', 'conversation_id', 'text', 'mentioned_users']) as Partial<Message>;
    setCreatedMessageData(message);
    return { type: MessageType.Text, ...message };
  }

  /**
   * 创建图片消息
   *
   * @param parameters
   * @returns
   */
  public createImageMessage(parameters: CreateMessageParameters): SendMessageParameters {
    if (!parameters.image && !parameters.file) {
      throw new Error('must have image payload or file')
    }
    const message = pick(parameters, ['from', 'to', 'conversation_id', 'image']) as Partial<Message>;
    setCreatedMessageData(message);

    // 直接传入已经构造好的 image 参数
    if (message.image) {
      return { type: MessageType.Image, ...message };
    }

    const { file, file_name, on_progress } = parameters;
    if (!file) {
      throw new Error('must select files')
    }

    let size = 0
    let format = ""
    let url = ""

    if (isBuffer(file)) {
      size = file.length
    } else if (isString(file)) {
      format = fileExt(file)
      url = file
    }
    if (file_name) {
      format = fileExt(file_name)
    }

    // 图片信息，包含原图、中图、小图
    message.image = { size, format, infos: [] };
    for (let i = 0; i < 3; i++) {
      message.image.infos.push({ url, width: 0, height: 0 });
    }
    return { type: MessageType.Image, ...message, file, on_progress };
  }

  /**
   * 创建音频消息
   *
   * @param parameters
   * @returns
   */
  public createAudioMessage(parameters: CreateMessageParameters): SendMessageParameters {
    if (!parameters.audio && !parameters.file) {
      throw new Error('must have audio payload or file')
    }
    const message = pick(parameters, ['from', 'to', 'conversation_id', 'audio']) as Partial<Message>;
    setCreatedMessageData(message);

    // 直接传入已经构造好的 audio 参数
    if (message.audio) {
      return { type: MessageType.Audio, ...message };
    }

    const { file, file_name, on_progress } = parameters;
    if (!file) {
      throw new Error('must select files')
    }

    let size = 0
    let format = ""
    let url = ""

    if (isBuffer(file)) {
      size = file.length
    } else if (isString(file)) {
      format = fileExt(file)
      url = file
    }
    if (file_name) {
      format = fileExt(file_name)
    }

    const duration = 0; // TODO 要实时录制可以获取时长
    message.audio = { url, duration, size, format };

    return { type: MessageType.Audio, ...message, file, on_progress };
  }

  /**
   * 创建视频消息
   * @param parameters
   * @returns
   */
  public createVideoMessage(parameters: CreateMessageParameters): SendMessageParameters {
    if (!parameters.video && !parameters.file) {
      throw new Error('must have video payload or file')
    }
    const message = pick(parameters, ['from', 'to', 'conversation_id', 'video']) as Partial<Message>;
    setCreatedMessageData(message);

    // 直接传入已经构造好的 video 参数
    if (message.video) {
      return { type: MessageType.Video, ...message };
    }

    const { file, file_name, on_progress } = parameters;
    if (!file) {
      throw new Error('must select files')
    }

    let size = 0
    let format = ""
    let url = ""

    if (isBuffer(file)) {
      size = file.length
    } else if (isString(file)) {
      format = fileExt(file)
      url = file
    }
    if (file_name) {
      format = fileExt(file_name)
    }

    const duration = 0;
    message.video = { url, duration, size, format };
    return { type: MessageType.Video, ...message, file, on_progress };
  }

  /**
   * 发布动态
   *
   * @param parameters
   * @returns
   */
  public async publishMoment(parameters: PublishMomentParameters): Promise<Moment> {
    // 先上传文件
    if (parameters.files && parameters.files.length > 0) {
      const contents = await Promise.all(
        parameters.files.map((file, idx) => {
          const options: UploadOptions = {
            onProgress: (percent) => parameters.on_progress && parameters.on_progress(idx, percent),
            moment: parameters as Moment,
          };
          let attachment: Attachment
          if (isReadableStream(file) || isBuffer(file)) {
            attachment = { file }
          } else if (isString(file)) {
            attachment = { file }
          } else {
            attachment = file as Attachment
          }
          return this.uploadPlugin.upload(attachment, options);
        }),
      );

      switch (parameters.type) {
        case MomentType.Image: {
          parameters.images = contents as Array<ImageMomentContent>;
          break;
        }
        case MomentType.Video: {
          parameters.video = contents[0] as VideoMomentContent;
          break;
        }
        default: {
          throw new Error('unsupported message type');
        }
      }
    }

    return this.post('/publish_moment', omit(parameters, ['files', 'on_progress']))
  }

  /**
   * 创建文本动态
   *
   * @param parameters
   * @returns
   */
  public createTextMoment(parameters: CreateMomentParameters): PublishMomentParameters {
    if (!parameters.text) {
      throw new Error('must have text')
    }
    const moment = pick(parameters, ['user_id', 'text']) as Partial<Moment>;
    // 由前端生成id
    moment.id = nanoid();
    return { type: MomentType.Text, ...moment };
  }

  /**
   * 创建图片动态
   *
   * @param parameters
   * @returns
   */
  public createImageMoment(parameters: CreateMomentParameters): PublishMomentParameters {
    if (!parameters.images && !parameters.files) {
      throw new Error('must have images or files')
    }
    const moment = pick(parameters, ['user_id', 'images']) as Partial<Moment>;

    // 由前端生成id
    moment.id = nanoid();

    // 直接传入已经构造好的 images 参数
    if (moment.images && moment.images.length > 0) {
      return { type: MomentType.Image, ...moment };
    }

    // 需要上传文件，拿到文件句柄
    const { files, on_progress } = parameters;
    if (!files || files.length === 0) {
      throw new Error('must select files')
    }

    // 构造图片信息，方便占位显示
    moment.images = [];
    files.forEach((file) => {
      let size = 0
      let url = ""
      let format = ""

      if (isBuffer(file)) {
        size = file.length
      } else if (isString(file)) {
        url = file
        format = fileExt(file)
      } else if (!isReadableStream(file)) {
        const { file: f, name } = file as Attachment
        if (isBuffer(f)) {
          size = f.length
        } else if (isString(f)) {
          url = f
          format = fileExt(f)
        }
        if (name) {
          format = fileExt(name)
        }
      }
      // 图片信息，包含原图、中图、小图
      const image: ImageMomentContent = { size, format, infos: [] };
      for (let i = 0; i < 3; i++) {
        image.infos.push({ url, width: 0, height: 0 });
      }
      moment.images?.push(image);
    });

    return { type: MomentType.Image, ...moment, files, on_progress };
  }

  /**
   * 创建视频动态
   *
   * @param parameters
   * @returns
   */
  public createVideoMoment(parameters: CreateMomentParameters): PublishMomentParameters {
    if (!parameters.video && !parameters.files) {
      throw new Error('must have images or files')
    }
    const moment = pick(parameters, ['user_id', 'video']) as Partial<Moment>;

    // 由前端生成id
    moment.id = nanoid();

    // 直接传入已经构造好的 video 参数
    if (moment.video) {
      return { type: MomentType.Video, ...moment };
    }

    const { files, on_progress } = parameters;
    if (!files || files.length === 0) {
      throw new Error('must have images or files')
    }
    const file = files[0]
    if (!file) {
      throw new Error('must have images or files')
    }

    let size = 0
    let format = ""
    let url = ""

    if (isBuffer(file)) {
      size = file.length
    } else if (isString(file)) {
      url = file
      format = fileExt(file)
    } else if (!isReadableStream(file)) {
      const { file: f, name } = file as Attachment
      if (isBuffer(f)) {
        size = f.length
      } else if (isString(f)) {
        url = f
        format = fileExt(f)
      }
      if (name) {
        format = fileExt(name)
      }
    }

    const duration = 0;
    moment.video = { url, duration, size, format };

    return { type: MomentType.Video, ...moment, files: [file], on_progress };
  }
  /**
   * 监听事件
   *
   * @param type
   * @param handler
   * @returns
   */
  public on(type: UIMEventType, handler: EventHandler) {
    this.eventEmitter.on(type, handler);
  }

  /**
   * 取消监听事件
   *
   * @param type
   * @param handler
   */
  public off(type: UIMEventType, handler: EventHandler) {
    this.eventEmitter.off(type, handler);
  }

  /**
   * 监听账号的 pubnub 推送
   *
   * @param _channel
   * @param e
   * @param _extra
   */
  private onEvent(_channel: string, e: unknown, _extra?: unknown) {
    const evt = e as UIMEvent;
    this.eventEmitter.emit(evt.type, evt);
  }

  private logApiRequest(
    type: string,
    url: string,
    data: unknown,
    config: AxiosRequestConfig & {
      config?: AxiosRequestConfig & { maxBodyLength?: number };
    },
  ) {
    this.log(LogLevel.DEBUG, `${type} - Request - ${url}`, {
      tags: ['api', 'api_request', 'client'],
      payload: data,
      config,
    });
  }

  private logApiResponse<T>(type: string, url: string, response: AxiosResponse<T>) {
    this.log(LogLevel.DEBUG, `${type} - Response - ${url} > status ${response.status}`, {
      tags: ['api', 'api_response', 'client'],
      response,
    });
  }

  private logApiError(type: string, url: string, error: unknown) {
    this.log(LogLevel.ERROR, `${type} - Error - ${url}`, {
      tags: ['api', 'api_response', 'client'],
      error,
    });
  }

  private doAxiosRequest = async <T>(
    type: string,
    url: string,
    data?: unknown,
    options: AxiosRequestConfig & {
      config?: AxiosRequestConfig & { maxBodyLength?: number };
    } = {},
  ): Promise<T> => {
    const requestConfig = this._enrichAxiosOptions(options);
    try {
      let response: AxiosResponse<T>;
      this.logApiRequest(type, url, data, requestConfig);
      switch (type) {
        case 'get':
          response = await this.axiosInstance.get(url, requestConfig);
          break;
        case 'delete':
          response = await this.axiosInstance.delete(url, requestConfig);
          break;
        case 'post':
          response = await this.axiosInstance.post(url, data, requestConfig);
          break;
        case 'put':
          response = await this.axiosInstance.put(url, data, requestConfig);
          break;
        case 'patch':
          response = await this.axiosInstance.patch(url, data, requestConfig);
          break;
        case 'options':
          response = await this.axiosInstance.options(url, requestConfig);
          break;
        default:
          throw new Error('Invalid request type');
      }
      this.logApiResponse<T>(type, url, response);
      return this.handleResponse(response);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any /**TODO: generalize error types  */) {
      e.client_request_id = requestConfig.headers?.['x-client-request-id'];
      this.logApiError(type, url, e);
      if (e.response) {
        return this.handleResponse(e.response);
      } else {
        throw e as AxiosError<APIErrorResponse>;
      }
    }
  };

  private get<T>(url: string, params?: AxiosRequestConfig['params']) {
    return this.doAxiosRequest<T>('get', url, null, { params });
  }

  private put<T>(url: string, data?: unknown) {
    return this.doAxiosRequest<T>('put', url, data);
  }

  private post<T>(url: string, data?: unknown) {
    return this.doAxiosRequest<T>('post', url, data);
  }

  private patch<T>(url: string, data?: unknown) {
    return this.doAxiosRequest<T>('patch', url, data);
  }

  private delete<T>(url: string, params?: AxiosRequestConfig['params']) {
    return this.doAxiosRequest<T>('delete', url, null, { params });
  }

  private handleResponse<T>(response: AxiosResponse<T>) {
    const data = response.data;
    if (isErrorResponse(response)) {
      throw this.errorFromResponse(response);
    }
    return data;
  }

  private errorFromResponse(response: AxiosResponse<APIErrorResponse>): ErrorFromResponse<APIErrorResponse> {
    let err: ErrorFromResponse<APIErrorResponse>;
    err = new ErrorFromResponse(`UIM error HTTP code: ${response.status}`);
    if (response.data && response.data.code) {
      err = new Error(`UIM error code ${response.data.code}: ${response.data.message}`);
      err.code = response.data.code;
    }
    err.response = response;
    err.status = response.status;
    return err;
  }


  private _enrichAxiosOptions(
    options: AxiosRequestConfig & { config?: AxiosRequestConfig } = {
      params: {},
      headers: {},
      config: {},
    },
  ): AxiosRequestConfig {
    const authorization = this.token ? { Authorization: `Bearer ${this.token}` } : undefined;
    let signal: AbortSignal | null = null;
    if (this.nextRequestAbortController !== null) {
      signal = this.nextRequestAbortController.signal;
      this.nextRequestAbortController = null;
    }

    if (!options.headers?.['x-client-request-id']) {
      options.headers = {
        ...options.headers,
        'x-client-request-id': nanoid(),
      };
    }

    const { params: axiosRequestConfigParams, headers: axiosRequestConfigHeaders, ...axiosRequestConfigRest } =
      this.axiosRequestConfig || {};

    return {
      params: {
        ...options.params,
        ...(axiosRequestConfigParams || {}),
      },
      headers: {
        ...authorization,
        'X-UIM-Client': this.getUserAgent(),
        ...options.headers,
        ...(axiosRequestConfigHeaders || {}),
      },
      ...(signal ? { signal } : {}),
      ...options.config,
      ...(axiosRequestConfigRest || {}),
    };
  }

  getUserAgent() {
    return (
      this.userAgent || `uim-javascript-client-node-${process.env.PKG_VERSION}`
    );
  }

  /**
   * creates an abort controller that will be used by the next HTTP Request.
   */
  createAbortControllerForNextRequest() {
    return (this.nextRequestAbortController = new AbortController());
  }

  /**
   * Emits a log message to the console.
   *
   * @param level The level for this message
   * @param args Arguments to send to the console
   */
  private log(level: LogLevel, message: string, extraInfo: Record<string, unknown>) {
    if (logLevelSeverity(level) >= logLevelSeverity(this.logLevel)) {
      this.logger(level, message, extraInfo);
    }
  }
}

/**
 * 为前端创建的消息填充必要的字段
 *
 * @param message
 */
export function setCreatedMessageData(message: Partial<Message>) {
  message.id = nanoid();
  message.flow = MessageFlow.Out;
  message.sent_at = new Date().getTime();
  message.status = MessageStatus.Unsent;
  message.created_at = new Date().getTime();
  message.revoked = false;
}

const convertFileListToArray = (files?: FileList | null): Array<File> => {
  if (!files) return [];
  const f: Array<File> = [];
  const len = files.length;
  for (let i = 0; i < len; i++) {
    const file = files.item(i);
    if (file) f.push(file);
  }
  return f;
};

function userFromToken(token: string): string {
  const fragments = token.split('.');
  if (fragments.length !== 3) {
    return '';
  }
  const b64Payload = fragments[1];
  const payload = decodeBase64(b64Payload);
  const data = JSON.parse(payload);
  return data.sub as string;
}