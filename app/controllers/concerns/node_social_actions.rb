# Node owns browser authentication, social scopes, permissions and transactions.
# Rails renders the existing views; legacy actions remain an optional fallback.
module NodeSocialActions
  extend ActiveSupport::Concern
  included do
    rescue_from NodeSocialBackend::Unavailable do |error|
      render plain: error.message, status: :service_unavailable
    end
    rescue_from NodeSocialBackend::Rejected do |error|
      if error.status == 422
        if controller_name == 'comments' && action_name == 'create'
          @link = (NodeBrowserBackend.enabled? ? browser_link(params[:link_id], purpose: 'search') : Link.find(params[:link_id])); @comment = Comment.new(content: params[:comment]&.[](:content))
          @comment.errors.add(:content, error.message)
          render :new, status: :unprocessable_entity
        else
          fallback = case controller_name
          when 'friendships' then friendships_path
          when 'leashes' then action_name == 'create' ? new_leash_path : user_leashes_path(current_user.username)
          when 'surrenders' then new_surrender_path
          when 'scoops' then action_name == 'create' ? new_scoop_path : scoops_path
          when 'kink' then user_kinks_path(current_user.username)
          when 'message_thread' then message_thread_index_path
          else root_path
          end
          redirect_to fallback, alert: error.message, status: :see_other
        end
      else
        render plain: error.message, status: error.status
      end
    end
  end

  private

  def social(operation, **input)
    NodeSocialBackend.request(operation, { actor_id: current_user&.id,
      surrender_id: current_surrender_session&.id, request_key: SecureRandom.uuid, **input })
  end

  def social_records(result, key, model)
    NodeSocialBackend.records(result, key, model)
  end

  def social_thread(id = params[:id], before_id: nil)
    result = social(before_id ? 'messages-before' : 'thread', thread_id: id, after_id: before_id)
    if NodeBrowserBackend.enabled?
      graph = NodeBrowserBackend.graph(threads: [result.fetch('thread').fetch('id')],
        participants: result.fetch('participants').map { |r| r.fetch('id') }, messages: result.fetch('messages').map { |r| r.fetch('id') })
      @message_thread = graph.find(MessageThread, result.fetch('thread').fetch('id'))
      @social_messages = graph.overlay(Message, result.fetch('messages'))
      @after_message = Message.instantiate(result['cursor']) if result['cursor']
      return @message_thread
    end
    @message_thread = MessageThread.instantiate(result.fetch('thread'))
    participants = social_records(result, 'participants', MessageThreadParticipant)
    @message_thread.association(:participants).target = participants
    @message_thread.association(:users).target = User.where(id: participants.map(&:user_id)).to_a
    @social_messages = social_records(result, 'messages', Message)
    @after_message = Message.instantiate(result['cursor']) if result['cursor']
    @message_thread
  end

  def serve_node_social
    return unless NodeSocialBackend.enabled?
    case controller_name
    when 'friendships' then serve_social_friendships
    when 'message_thread' then serve_social_messages
    when 'message_thread_participant'
      social('thread-notify', thread_id: params[:message_thread_id], participant_id: params[:id],
        notify: params.require(:message_thread_participant)[:notify])
      message_thread = social_thread(params[:message_thread_id])
      render turbo_stream: turbo_stream.update(ActionView::RecordIdentifier.dom_id(message_thread) + '-controls',
        partial: 'message_thread/controls', locals: { message_thread: })
    when 'comments'
      case action_name
      when 'index'
        @comments = social_records(social('comments', link_id: params[:link_id]), 'comments', Comment)
        render :index
      when 'new'
        social('comments', link_id: params[:link_id]) # Same visibility policy as the link.
        @link = (NodeBrowserBackend.enabled? ? browser_link(params[:link_id], purpose: 'search') : Link.find(params[:link_id])); @comment = Comment.new
        render :new
      when 'create'
        social('comment-create', link_id: params[:link_id], content: params.require(:comment)[:content], visit_id: current_visit&.id,
          activity_visit: NodeActivityBackend.enabled? ? NodeActivityBackend.visit_proof(current_visit) : nil,
          surrender_id: browser_surrender_id)
        redirect_to new_link_comment_path(params[:link_id])
      end
    when 'notification'
      case action_name
      when 'index'
        @notifications = social_records(social('notifications'), 'notifications', Notification)
        render :index
      when 'show'
        result = social('notification-read', notification_id: params[:id]); redirect_to result.fetch('link')
      when 'delete_all'
        social('notifications-clear'); redirect_back fallback_location: root_path
      end
    when 'leashes' then serve_social_leashes
    when 'surrenders' then serve_social_surrenders
    when 'scoops'
      case action_name
      when 'index'
        @scoops = social_records(social('scoops'), 'scoops', Scoop); render :index
      when 'show', 'edit'
        @scoop = social_records({ 'record'=>[social('scoop', scoop_id: params[:id], edit: action_name == 'edit').fetch('scoop')] }, 'record', Scoop).first
        return head :forbidden if action_name == 'edit' && @scoop.user_id != current_user.id
        render action_name
      when 'create'
        social('scoop-create', details: params.require(:scoop)[:details]); redirect_to scoops_path
      when 'update'
        social('scoop-update', scoop_id: params[:id], details: params.require(:scoop)[:details]); redirect_to edit_scoop_path(params[:id]), notice: 'Updated!'
      when 'destroy'
        social('scoop-delete', scoop_id: params[:id]); redirect_to scoops_path, notice: 'Scoop removed.'
      end
    when 'kink'
      case action_name
      when 'users_kinks'
        result = social('kinks', username: params[:user_id]); @user = social_records({ 'record'=>[result.fetch('user')] }, 'record', User).first
        @kinks = social_records(result, 'kinks', Kink); @is_current_user = current_user&.id == @user.id
        render :users_kinks
      when 'show'
        result = social('kink', kink_id: params[:id]); @kink = social_records({ 'record'=>[result.fetch('kink')] }, 'record', Kink).first
        @users = social_records(result, 'users', User); render :show
      when 'update'
        result = social('kink-add', name: params.require(:kink)[:name]); @kink = (NodeBrowserBackend.enabled? ? NodeBrowserBackend.find(Kink, result.fetch('kink_id')) : Kink.find(result.fetch('kink_id'))); render :update
      when 'remove'
        result = social('kink-remove', kink_id: params[:id]); @kink = (NodeBrowserBackend.enabled? ? NodeBrowserBackend.find(Kink, result.fetch('kink_id')) : Kink.find(result.fetch('kink_id'))); render :remove
      when 'toggle_star'
        result = social('kink-star', kink_id: params[:id]); @kink = (NodeBrowserBackend.enabled? ? NodeBrowserBackend.find(Kink, result.fetch('kink_id')) : Kink.find(result.fetch('kink_id'))); render :toggle_star
      end
    when 'leaderboard'
      @top_setters = social_records(social('leaderboard'), 'users', User); render :index
    end
  end

  def serve_social_friendships
    case action_name
    when 'index', 'requests'
      list = social_records(social('friends'), 'friendships', Friendship)
      @user = current_user
      @friendships = list.select { |f| action_name == 'requests' ? !f.confirmed && f.receiver_id == current_user.id : f.confirmed }
      @pending_friendship_requests = list.select { |f| !f.confirmed && f.sender_id == current_user.id } if action_name == 'index'
      render :index
    when 'show', 'edit'
      @friendship = social_records({ 'record'=>[social('friend', friendship_id: params[:id]).fetch('friendship')] }, 'record', Friendship).first; render action_name
    when 'create'
      social('friend-request', username: params[:receiver_username]); redirect_back_or_to root_path, notice: 'Friend request sent!'
    when 'accept'
      social('friend-accept', friendship_id: params[:id]); redirect_to friendships_path, notice: 'Friendship Accepted!'
    when 'destroy'
      social('friend-delete', friendship_id: params[:id])
      respond_to do |format|
        format.html { redirect_to friendships_path, notice: 'Friendship was successfully destroyed.' }
        format.json { head :no_content }
      end
    end
  end

  def serve_social_messages
    case action_name
    when 'index'
      @message_threads = social_records(social('threads'), 'threads', MessageThread); render :index
    when 'show'
      social_thread; @new_message = @message_thread.messages.new; render :show
    when 'edit'
      social_thread; @current_participants = @message_thread.users
      @friendships = social_records(social('friends'), 'friendships', Friendship).select do |f|
        f.confirmed && !@current_participants.any? { |u| u.id == f.other_user(current_user)&.id }
      end
      render :edit
    when 'load_more'
      social_thread(params[:id], before_id: params[:after_id]); @older_messages = @social_messages; render :load_more
    when 'send_message'
      social('message-send', thread_id: params[:id], content: params.require(:message)[:content]); redirect_to message_thread_path(params[:id])
    when 'new'
      result = social('thread-create'); redirect_to edit_message_thread_path(result.fetch('thread_id'))
    when 'resolve'
      result = social('thread-resolve', user_id: params[:user_id]); redirect_to message_thread_path(result.fetch('thread_id'))
    when 'add_user', 'remove_user'
      social(action_name == 'add_user' ? 'thread-add' : 'thread-remove', thread_id: params[:id], user_id: params[:user_id])
      redirect_to (action_name == 'remove_user' && params[:user_id].to_s == current_user.id.to_s ? message_thread_index_path : edit_message_thread_path(params[:id]))
    when 'update'
      social('thread-name', thread_id: params[:id], name: params[:message_thread]&.[](:name), reset: params[:commit] == 'Reset')
      redirect_to edit_message_thread_path(params[:id])
    end
  end

  def serve_social_leashes
    case action_name
    when 'index'
      result = social('leashes', username: params[:user_id]); @user = social_records({ 'record'=>[result.fetch('user')] }, 'record', User).first
      all = social_records(result, 'leashes', Leash); owned = all.find { |l| l.pet_id == @user.id }
      @master = owned&.master; @held_leashes = all.select { |l| l.master_id == @user.id }; render :index
    when 'new'
      @leash = Leash.new(pet: current_user)
      @social_friendships = social_records(social('friends'), 'friendships', Friendship).select(&:confirmed)
      render :new
    when 'show', 'edit'
      @leash = social_records({ 'record'=>[social('leash', leash_id: params[:id]).fetch('leash')] }, 'record', Leash).first
      return head :forbidden if action_name == 'edit' && @leash.master_id != current_user.id
      render action_name
    when 'create'
      social('leash-create', friendship_id: params.require(:leash)[:friendship_id]); redirect_to user_leashes_path(current_user.username)
    when 'update'
      social('leash-update', leash_id: params[:id], flair: params.require(:leash)[:flair]); redirect_to edit_leash_path(params[:id]), notice: 'Flair was successfully updated.'
    when 'destroy'
      social('leash-delete', leash_id: params[:id]); redirect_to user_leashes_path(current_user.username), notice: 'Leash released.'
    end
  end

  def serve_social_surrenders
    case action_name
    when 'index'
      @current_surrender = social_records(social('surrenders'), 'surrenders', Surrender).first; render :index
    when 'new'
      @surrender = Surrender.new
      @friendship_options = social_records(social('friends'), 'friendships', Friendship).select(&:confirmed).map { |f| [f.other_user(current_user).username, f.id] }
      render :new
    when 'show'
      @surrender = social_records({ 'record'=>[social('surrender', id: params[:id]).fetch('surrender')] }, 'record', Surrender).first
      return head :forbidden unless @surrender.user_id == current_user.id
      render :show
    when 'create'
      input = params.require(:surrender)
      result = social('surrender-create', friendship_id: input[:friendship], duration: input[:duration], accepted: input[:accepted_consequences], pending: input[:pending])
      redirect_to surrender_path(result.fetch('surrender_id')), notice: 'Surrender was successfully created. Now just wait...'
    when 'destroy'
      social('surrender-delete', id: params[:id]); redirect_to surrenders_path, notice: 'Surrender was successfully destroyed.'
    when 'assume'
      if NodeBrowserBackend.enabled?
        node_browser_transition('surrender-assume', id: params[:id]); ahoy.authenticate(current_user)
        return redirect_to root_path
      end
      result = social('surrender-assume', id: params[:id]); surrender = Surrender.find(result.fetch('surrender_id'))
      log_in_as(surrender.user, surrender)
    when 'return_to_controller'
      if NodeBrowserBackend.enabled?
        node_browser_transition('surrender-return'); ahoy.authenticate(current_user)
        return redirect_to root_path, notice: "Returned to #{current_user.username}."
      end
      surrender = current_surrender_session
      return head :forbidden unless surrender
      social('surrender-return', id: surrender.id)
      controller = surrender.controller
      session[:user_id] = controller.id; cookies.delete :permanent_session_id; cookies.delete :surrender_id
      @current_user = controller; ahoy.authenticate(controller)
      redirect_to root_path, notice: "Returned to #{controller.username}."
    end
  end
end
