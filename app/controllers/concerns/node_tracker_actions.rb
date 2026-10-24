# Rails renders the existing views; Node owns browser authentication and tracker state.
module NodeTrackerActions
  extend ActiveSupport::Concern
  included do
    helper_method :tracker_pledge, :tracker_pledges_enabled?
    rescue_from NodeTrackerBackend::Unavailable do
      render plain: 'Tracker features are temporarily unavailable. Please try again.', status: :service_unavailable
    end
    rescue_from NodeTrackerBackend::Rejected do |error|
      if error.status == 422 && %w[create update].include?(action_name)
        fallback = controller_name == 'nut_pledges' ? main_app.new_user_nut_pledge_path(params[:user_id]) :
          (action_name == 'update' ? edit_orgasm_path(params[:id]) : new_orgasm_path)
        redirect_to fallback, alert: error.message, status: :see_other
      elsif controller_name == 'nut_pledges' && error.message == 'NNN is not currently enabled.'
        redirect_to main_app.root_path, alert: error.message
      else
        render plain: error.message, status: error.status
      end
    end
  end

  private

  def tracker(operation, **input)
    response.set_header('X-Walltaker-Tracker', 'node')
    NodeTrackerBackend.request(operation, { actor_id: current_user&.id,
      surrender_id: current_surrender_session&.id, request_key: SecureRandom.uuid, **input })
  end

  def tracker_status(user)
    @tracker_status ||= {}
    @tracker_status[user.id] ||= tracker('pledge-status', username: user.username)
  end

  def tracker_pledge(user)
    return user.current_nut_pledge unless NodeTrackerBackend.enabled?
    attrs = tracker_status(user)['current']
    attrs && NodeTrackerBackend.records({ 'record'=>[attrs] }, 'record', NutPledge).first
  end

  def tracker_pledges_enabled?
    return SiteConfig.nnn_enabled? unless NodeTrackerBackend.enabled?
    tracker_status(@user || current_user).fetch('nnn_enabled')
  end

  def tracker_form(result)
    @pornlizard = NodeTrackerBackend.records({ 'record'=>[result['pornlizard']] }, 'record', User).first if result['pornlizard']
    @friends = NodeTrackerBackend.records(result, 'friends', User)
    @recent_setters = NodeTrackerBackend.records(result, 'recent_setters', User)
  end

  def tracker_pledges(result)
    @user = NodeTrackerBackend.records({ 'record'=>[result.fetch('user')] }, 'record', User).first
    @is_current_user = current_user&.id == @user.id
    @nut_pledge = NodeTrackerBackend.records({ 'record'=>[result['current']] }, 'record', NutPledge).first if result['current']
    @nut_pledges = NodeTrackerBackend.records(result, 'pledges', NutPledge)
    past_links = NodeTrackerBackend.records(result, 'past_links', PastLink).index_by(&:id)
    (@nut_pledges + [@nut_pledge]).compact.each do |pledge|
      pledge.association(:past_link).target = past_links[pledge.past_link_id]
    end
  end

  def serve_node_tracker
    return unless NodeTrackerBackend.enabled?
    if controller_name == 'nut_pledges'
      case action_name
      when 'show', 'history', 'new'
        tracker_pledges(tracker('pledges', username: params[:user_id]))
        if action_name == 'new'
          return head :forbidden unless @is_current_user
          return redirect_to main_app.user_path(@user.username) if @nut_pledge
          @nut_pledge = NutPledge.new
        end
        render action_name
      when 'create', 'update'
        tracker(action_name == 'create' ? 'pledge-create' : 'pledge-fail', username: params[:user_id],
          signature: params[:nut_pledge]&.[](:username))
        if action_name == 'update'
          tracker_pledges(tracker('pledges', username: params[:user_id]))
          render :show
        else
          redirect_to main_app.user_path(params[:user_id]), status: :see_other
        end
      end
      return
    end
    case action_name
    when 'index', 'index_for_user'
      result = tracker('entries', username: params[:username], page: params[:page])
      @user = NodeTrackerBackend.records({ 'record'=>[result['user']] }, 'record', User).first if result['user']
      @orgasms = NodeTrackerBackend.records(result, 'entries', Nuttracker::Orgasm)
      @tracker_page = result.fetch('page'); @tracker_has_more = result.fetch('has_more')
      render action_name
    when 'show', 'edit'
      result = tracker('entry', entry_id: params[:id], edit: action_name == 'edit')
      @orgasm = NodeTrackerBackend.records({ 'record'=>[result.fetch('entry')] }, 'record', Nuttracker::Orgasm).first
      tracker_form(result) if action_name == 'edit'
      render action_name
    when 'new'
      @orgasm = Nuttracker::Orgasm.new
      tracker_form(tracker('form'))
      render :new
    when 'create', 'update'
      input = params.require(:orgasm).permit(:rating, :is_ruined, :caused_by).to_h.symbolize_keys
      result = tracker(action_name == 'create' ? 'entry-create' : 'entry-update', entry_id: params[:id], **input)
      redirect_to(action_name == 'create' ? new_orgasm_path : orgasm_path(result.fetch('entry').fetch('id')),
        notice: "Orgasm was successfully #{action_name == 'create' ? 'created' : 'updated'}.", status: :see_other)
    when 'destroy'
      tracker('entry-delete', entry_id: params[:id])
      redirect_to orgasms_path, notice: 'Orgasm was successfully destroyed.', status: :see_other
    end
  end
end
