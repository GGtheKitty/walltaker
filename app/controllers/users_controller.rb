class UsersController < ApplicationController
  PASSWORD_RESET_NOTICE = 'If an account exists for that email, a password reset email has been sent.'
  PASSWORD_RESET_COOLDOWN = 10.minutes

  after_action :track_visit, only: %i[new show edit]
  before_action :authorize, only: %i[update toggle_details_mode]

  def new
    @user = User.new
    @invite_only = SiteConfig.invite_only?
  end

  def show
    set_user_vars
    set_nut_tracker_vars
  end

  def sets
    @user = User.active.find_by(username: params[:username])
    @past_links = PastLink.where(set_by_id: @user.id).order(id: :desc).limit(50)
  end

  def edit
    set_user_vars
    set_nut_tracker_vars
    @is_editing = true
    return redirect_to user_path(@user.username) unless @is_current_user

    render 'users/show'
  end

  def set_nut_tracker_vars
    @total_orgasms_by_day = @user.orgasms.where('created_at > ?', 1.weeks.ago.midnight).group_by_day(:created_at, range: 1.weeks.ago.midnight..Time.now).count
    @total_orgasms = @user.orgasms.where('created_at > ?', 1.weeks.ago.midnight).count
    @total_orgasms_caused = @user.caused_orgasms.where('caused_by_user_id <> user_id').count unless @user.username == 'gray'
    @total_orgasms_caused = Nuttracker::Orgasm.count if @user.username == 'gray'
  end

  def update
    @user = User.active.find(params[:id])
    return redirect_to user_path(@user.username), { alert: 'Not Authorized.' } if current_user.id != @user.id

    if @user.profile
      @user.profile.content = user_params[:details]
      @user.profile.save
    else
      new_profile = Profile.create({ user: @user, name: nil, content: user_params[:details] })
      @user.profile = new_profile
      @user.save
    end

    @user.profile.content = user_params[:details]
    if @user.save
      track :regular, :updated_details

      if @user.current_surrender
        Notification.create user: @user, notification_type: :surrender_event, link: user_path(@user.username), text: "#{@user.current_surrender.controller.username} changed a profile setting."
      end
      redirect_to user_path(@user.username), { notice: 'Successfully updated user.' }
    else
      track :error, :updating_details_went_wrong
      redirect_to user_path(@user.username), { alert: 'Something went wrong' }
    end
  end

  def create
    if current_visit&.banned_ip.present?
      return
    end

    @invite_only = SiteConfig.invite_only?
    @user = User.new(user_params)
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
    @user = User.active.find_by(username: params[:username])
    if (@user.id == current_user.id)
      @user.assign_new_api_key
    end
    redirect_to user_path(@user.username)
  end

  def toggle_details_mode
    current_user.advanced = !current_user.advanced
    if current_user.save
      redirect_to edit_user_path(current_user.username)
    else
      redirect_to root_path, alert: 'Something went wrong'
    end
  end

  def details
    @user = User.active.find(params[:id])
  end

  private

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
    @user = User.active.find_by(username: params[:username])
    if @user.present?
      @is_current_user = current_user && current_user.id == @user.id
      @has_friendship = Friendship.find_friendship(current_user, @user).exists? if current_user
      if current_user && @user.master == current_user
        @links = @user.link.all
      else
        @links = @user.link.where(friends_only: false).and(@user.link.where('expires > ?', Time.now).or(@user.link.where(never_expires: true))) unless (@has_friendship or @is_current_user)
        @links = @user.link.where('expires > ?', Time.now).or(@user.link.where(never_expires: true)) if (@has_friendship or @is_current_user)
      end
      @any_links_online = @links.is_online.count.positive?
      @most_recent_pinged_link = @links.order(last_ping: :desc).take(1) if @links.count.positive?
      @past_links = PastLink.all.order(id: :desc).where(user: @user).take(5)
    else
      raise ActionController::RoutingError.new('Missing user or the username was typed incorrectly.')
    end
  end

  def user_params
    params.require(:user).permit(:email, :username, :password, :password_confirmation, :details)
  end
end
