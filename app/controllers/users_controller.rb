class UsersController < ApplicationController
  rescue_from NodeAccountBackend::Unavailable do
    render plain: 'Accounts are temporarily unavailable. Please try again.', status: :service_unavailable
  end
  rescue_from NodeAccountBackend::Rejected do |error|
    render plain: error.message, status: error.status
  end
  rescue_from NodeWallpaperBackend::Unavailable do
    render plain: 'Wallpaper history is temporarily unavailable. Please try again.', status: :service_unavailable
  end
  PASSWORD_RESET_NOTICE = 'If an account exists for that email, a password reset email has been sent.'
  PASSWORD_RESET_COOLDOWN = 10.minutes

  after_action :track_visit, only: %i[new show edit]
  before_action :authorize, only: %i[update toggle_details_mode new_api_key]

  def new
    @user = User.new
    @invite_only = SiteConfig.invite_only?
  end

  def show
    @user = NodeBrowserBackend.enabled? ? browser_user(params[:username]) : NodeAccountBackend.enabled? ? NodeAccountBackend.find_user(params[:username]) : User.active.find_by(username: params[:username])
    raise ActionController::RoutingError.new('Missing user or the username was typed incorrectly.') unless @user

    @is_current_user = current_user && current_user.id == @user.id
    @report = Report.new(reporter: current_user, reportable: @user) if current_user && !@is_current_user
    render 'users/profile_shell', layout: 'profile_shell'
  end

  def profile_document
    unless request.headers['Sec-Fetch-Dest'] == 'iframe'
      return redirect_to user_path(params[:username])
    end

    set_user_vars
    set_nut_tracker_vars
    @profile_document = true
    response.headers['X-Robots-Tag'] = 'noindex, nofollow'
    render 'users/show'
  end

  def sets
    @user = NodeBrowserBackend.enabled? ? browser_user(params[:username]) : User.active.find_by(username: params[:username])
    raise ActionController::RoutingError, 'User not found.' unless @user

    @past_links = NodeWallpaperBackend.history(user: @user, kind: 'sent')
  end

  def edit
    set_user_vars
    set_nut_tracker_vars
    @is_editing = true
    return redirect_to user_path(@user.username) unless @is_current_user

    render 'users/show'
  end

  def set_nut_tracker_vars
    if NodeTrackerBackend.enabled?
      result = tracker('statistics', username: @user.username)
      @total_orgasms_by_day = result.fetch('days').to_h { |row| [row.fetch('day'), row.fetch('count')] }
      @total_orgasms = result.fetch('total')
      @total_orgasms_caused = result.fetch('caused')
      @tracker_status ||= {}
      @tracker_status[@user.id] = result.slice('current', 'nnn_enabled')
      return
    end
    @total_orgasms_by_day = @user.orgasms.where('created_at > ?', 1.weeks.ago.midnight).group_by_day(:created_at, range: 1.weeks.ago.midnight..Time.now).count
    @total_orgasms = @user.orgasms.where('created_at > ?', 1.weeks.ago.midnight).count
    @total_orgasms_caused = @user.caused_orgasms.where('caused_by_user_id <> user_id').count unless @user.username == 'gray'
    @total_orgasms_caused = Nuttracker::Orgasm.count if @user.username == 'gray'
  end

  def update
    @user = NodeBrowserBackend.enabled? ? browser_user(params[:id]) : User.active.find(params[:id])
    return redirect_to user_path(@user.username), { alert: 'Not Authorized.' } if current_user.id != @user.id

    details = user_params[:details]
    details = ProfileMarkdown.dump(details) unless @user.advanced?
    domain_filter = ProfileDomainFilter.filter_and_record(details)
    details = domain_filter.content

    if NodeAccountBackend.enabled?
      node_account_command('profile-content', content: details, expected_advanced: @user.advanced?)
      notice = 'Successfully updated user.'
      notice += " Links to blocked #{'domain'.pluralize(domain_filter.blocked_domains.length)} were removed." if domain_filter.blocked_domains.any?
      return redirect_to user_path(@user.username), notice:
    end

    if @user.profile
      @user.profile.content = details
      @user.profile.save
    else
      new_profile = Profile.create({ user: @user, name: nil, content: details })
      @user.profile = new_profile
      @user.save
    end

    @user.profile.content = details
    if @user.save
      track :regular, :updated_details

      if @user.current_surrender
        Notification.create user: @user, notification_type: :surrender_event, link: user_path(@user.username), text: "#{@user.current_surrender.controller.username} changed a profile setting."
      end
      notice = 'Successfully updated user.'
      notice += " Links to blocked #{'domain'.pluralize(domain_filter.blocked_domains.length)} were removed." if domain_filter.blocked_domains.any?
      redirect_to user_path(@user.username), { notice: }
    else
      track :error, :updating_details_went_wrong
      redirect_to user_path(@user.username), { alert: 'Something went wrong' }
    end
  end

  def create
    if !NodeBrowserBackend.enabled? && current_visit&.banned_ip.present?
      return
    end

    @invite_only = SiteConfig.invite_only?
    @user = User.new(NodeAccountBackend.enabled? ? user_params.except(:password, :password_confirmation) : user_params)
    return create_node_user if NodeAccountBackend.enabled?
    user_created = @invite_only ? create_user_with_invite : @user.save

    if user_created
      session[:user_id] = @user.id
      track :regular, :signed_up_and_first_log_in
      ahoy.authenticate(@user)
      redirect_to url_for(controller: :links, action: :index), notice: 'Thank you for signing up!'
    else
      track :error, :failed_to_sign_up, errors: @user.errors
      render 'new', status: :unprocessable_entity
    end
  end

  def request_password_reset

  end

  def password_reset
    if NodeBrowserBackend.enabled?
      NodeBrowserBackend.request('reset-request', email: params[:email].to_s)
      return redirect_to login_path, notice: PASSWORD_RESET_NOTICE
    end
    if NodeAccountBackend.enabled?
      NodeAccountBackend.request('reset-request', email: params[:email].to_s, request_key: "web:#{request.request_id}:reset-request")
      return redirect_to login_path, notice: PASSWORD_RESET_NOTICE
    end
    email = params[:email].to_s.strip.downcase
    user = User.active.where("lower(email) = ?", email).first

    unless user
      track :nefarious, :password_reset_unknown_email, tried_email: email
      return redirect_to login_path, notice: PASSWORD_RESET_NOTICE
    end

    if user.password_reset_sent_at && user.password_reset_sent_at > PASSWORD_RESET_COOLDOWN.ago
      track :regular, :password_reset_throttled, user: user.username, tried_email: email
      return redirect_to login_path, notice: PASSWORD_RESET_NOTICE
    end

    begin
      PasswordResetMailer.reset_password(user).deliver
      user.update_column(:password_reset_sent_at, Time.current)
      track :regular, :password_reset_email_sent, user: user.username
      redirect_to login_path, notice: PASSWORD_RESET_NOTICE
    rescue
      track :error, :failed_to_deliver_password_reset, tried_email: email, exception: $!
      redirect_to forgor_path, alert: 'Password reset email could not be sent'
    end
  end

  def apply_new_password

  end

  def commit_apply_new_password
    if NodeAccountBackend.enabled?
      begin
        NodeAccountBackend.request('reset-complete', token: params[:password_reset_token], password: params[:password],
          password_confirmation: params[:password_confirmation], request_key: "web:#{request.request_id}:reset-complete")
        return redirect_to login_path, notice: 'Password reset successfully!'
      rescue NodeAccountBackend::Rejected
        return redirect_to forgor_apply_path(params[:password_reset_token]), alert: 'Something went wrong, try again. Ensure the password confirmation was typed correctly.'
      end
    end
    user = User.active.find_by(password_reset_token: params['password_reset_token'])

    if user && params['password'] && params['password_confirmation'] && (params['password'] == params['password_confirmation'])
      user.password = params['password']
      user.password_confirmation = params['password_confirmation']
      user.password_reset_token = nil
      result = user.save

      if result
        return redirect_to login_path, notice: 'Password reset successfully!'
      end
    end

    redirect_to forgor_apply_path(params['password_reset_token']), alert: 'Something went wrong, try again. Ensure the password confirmation was typed correctly.'
  end

  def new_api_key
    @user = NodeBrowserBackend.enabled? ? browser_user(params[:username]) : User.active.find_by(username: params[:username])
    if (@user.id == current_user.id)
      NodeAccountBackend.enabled? ? node_account_command('api-key') : @user.assign_new_api_key
    end
    redirect_to user_path(@user.username)
  end

  def toggle_details_mode
    switching_to_html = !current_user.advanced?

    if NodeAccountBackend.enabled?
      profile = current_user.profile
      html = helpers.sanitize(ProfileMarkdown.to_html(current_user.details), scrubber: WallScrubber.new) if switching_to_html && profile && ProfileMarkdown.markdown?(profile.content)
      node_account_command('profile-mode', expected_advanced: current_user.advanced?, profile_id: profile&.id,
        profile_updated_at: profile&.updated_at&.iso8601(6), html:)
      return redirect_to edit_user_path(current_user.username)
    end

    User.transaction do
      if switching_to_html && current_user.profile && ProfileMarkdown.markdown?(current_user.details)
        html = helpers.sanitize(ProfileMarkdown.to_html(current_user.details), scrubber: WallScrubber.new)
        current_user.profile.update!(content: html)
      end

      current_user.update!(advanced: switching_to_html)
    end

    if current_user.persisted?
      redirect_to edit_user_path(current_user.username)
    else
      redirect_to root_path, alert: 'Something went wrong'
    end
  rescue ActiveRecord::RecordInvalid
    redirect_to root_path, alert: 'Something went wrong'
  end

  def details
    @user = NodeBrowserBackend.enabled? ? browser_user(params[:id]) : User.active.find(params[:id])
  end

  private

  def node_account_command(operation, **input)
    NodeAccountBackend.command(operation, actor: current_user, surrender_id: current_surrender_session&.id,
      request_key: "web:#{request.request_id}:#{operation}", **input)
  end

  def create_node_user
    if NodeBrowserBackend.enabled?
      node_browser_transition('signup', **user_params.to_h.symbolize_keys, invite_code: params[:invite_code])
      @user = current_user
      track :regular, :signed_up_and_first_log_in
      ahoy.authenticate(@user)
      return redirect_to links_path, notice: 'Thank you for signing up!'
    end
    result = NodeAccountBackend.request('signup', user_params.to_h.merge('invite_code' => params[:invite_code], 'request_key' => "web:#{request.request_id}:signup"))
    @user = User.active.find(result.fetch('user_id'))
    session[:user_id] = @user.id
    track :regular, :signed_up_and_first_log_in
    ahoy.authenticate(@user)
    redirect_to links_path, notice: 'Thank you for signing up!'
  rescue NodeAccountBackend::Rejected, NodeBrowserBackend::Rejected => error
    error.errors.each { |field, messages| Array(messages).each { |message| @user.errors.add(field, message) } }
    render 'new', status: :unprocessable_entity
  end

  def create_user_with_invite
    submitted_code = params[:invite_code].to_s.strip.upcase
    created = false

    User.transaction do
      invite = InviteCode.available.lock.find_by(code: submitted_code)
      unless invite
        @user.errors.add(:base, 'Invite code is invalid or has already been used.')
        raise ActiveRecord::Rollback
      end

      raise ActiveRecord::Rollback unless @user.save

      invite.redeem!(@user)
      created = true
    end

    created
  end

  def set_user_vars
    if NodeBrowserBackend.enabled?
      page = browser_page('profile-page', username: params[:username], private: true)
      @user = page.user; @is_current_user = page.data.fetch('is_current_user')
      @has_friendship = page.data.fetch('has_friendship')
      @links = NodeBrowserCollection.new(page.links, Link)
      @any_links_online = page.data.fetch('any_links_online')
      id = page.data['most_recent_pinged_link_id']
      @most_recent_pinged_link = [page.graph.find(Link, id)].compact
      @past_links = page.past_links
      @profile_styles = page.profiles if @is_current_user
      return
    end
    @user = NodeBrowserBackend.enabled? ? browser_user(params[:username]) : NodeAccountBackend.enabled? ? NodeAccountBackend.find_user(params[:username]) : User.active.find_by(username: params[:username])
    if @user.present?
      @is_current_user = current_user && current_user.id == @user.id
      if NodeAccountBackend.enabled? && @is_current_user
        @profile_styles = NodeAccountBackend.request('profiles-own', actor_id: current_user.id).fetch('profiles').map { |row| Profile.instantiate(row) }
      end
      @has_friendship = Friendship.find_friendship(current_user, @user).exists? if current_user
      if current_user && @user.master == current_user
        @links = @user.link.all
      else
        @links = @user.link.where(friends_only: false).and(@user.link.where('expires > ?', Time.now).or(@user.link.where(never_expires: true))) unless (@has_friendship or @is_current_user)
        @links = @user.link.where('expires > ?', Time.now).or(@user.link.where(never_expires: true)) if (@has_friendship or @is_current_user)
      end
      @any_links_online = @links.is_online.count.positive?
      @most_recent_pinged_link = @links.order(last_ping: :desc).take(1) if @links.count.positive?
      @past_links = NodeWallpaperBackend.history(user: @user, limit: 5)
    else
      raise ActionController::RoutingError.new('Missing user or the username was typed incorrectly.')
    end
  end

  def user_params
    params.require(:user).permit(:email, :username, :password, :password_confirmation, :details)
  end
end
