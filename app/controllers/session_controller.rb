class SessionController < ApplicationController
  rescue_from NodeAccountBackend::Unavailable do
    render plain: 'Login is temporarily unavailable. Please try again.', status: :service_unavailable
  end
  after_action :track_visit, only: %i[new]

  def new; end

  def create
    if NodeBrowserBackend.enabled?
      result = node_browser_transition('login', identifier: login_params[:email].to_s, password: login_params[:password], remember: params[:keep_me_logged_in].present?)
      if result['user']
        ahoy.authenticate(current_user)
        track :regular, :logged_in
        return redirect_to root_path, notice: 'Logged in!'
      end
      @error = 'Wrong email, username, or password.'
      track :nefarious, :failed_to_log_in, identifier: login_params[:email]
      return render :new, status: :unprocessable_entity
    end
    if current_visit&.banned_ip.present?
      return
    end

    login_identifier = login_params[:email].to_s.strip.downcase
    user = if NodeAccountBackend.enabled?
             result = NodeAccountBackend.request('authenticate', identifier: login_identifier, password: login_params[:password])
             User.active.find_by(id: result['user_id']) if result['user_id']
           else
             User.active.where("lower(email) = :identifier OR lower(username) = :identifier", identifier: login_identifier).first
           end
    if !user.nil?
      if user.system_account?
        @error = 'Wrong email, username, or password.'
        track :nefarious, :tried_to_log_in_as_system_account, username: user.username
        render 'new', status: :unprocessable_entity
      else
        if NodeAccountBackend.enabled? || user.authenticate(login_params[:password])
          cookies.signed[:surrender_id] = nil
          session[:user_id] = user.id unless params[:keep_me_logged_in]
          cookies.signed[:permanent_session_id] = { value: user.id, expires: 14.days.from_now } if params[:keep_me_logged_in]
          ahoy.authenticate(user)
          track :regular, :logged_in
          redirect_to url_for(controller: :dashboard, action: :index), notice: 'Logged in!'
        else
          @error = 'Wrong email, username, or password.'
          track :nefarious, :failed_to_log_in, identifier: login_params[:email]
          render 'new', status: :unprocessable_entity
        end
      end
    else
      @error = 'Wrong email, username, or password.'
      track :nefarious, :failed_to_log_in, identifier: login_params[:email]
      render 'new', status: :unprocessable_entity
    end
  end

  def destroy
    track :regular, :logged_out
    if NodeBrowserBackend.enabled?
      node_browser_transition('logout')
      return redirect_to root_path, notice: 'Logged out!'
    end
    if cookies.signed[:surrender_id].present?
      begin
        surrender = Surrender.find(cookies.signed[:surrender_id])
        if NodeSocialBackend.enabled?
          NodeSocialBackend.command('surrender-return', actor: current_user, surrender_id: surrender.id, id: surrender.id)
        else
          surrender.logged_in = false
          surrender.save
        end
        rescue
      end
    end
    session[:user_id] = nil
    cookies.signed[:surrender_id] = nil
    cookies.delete :permanent_session_id if cookies.signed[:permanent_session_id]
    reset_session
    redirect_to root_path, notice: 'Logged out!'
  end

  def be_evil
    if NodeBrowserBackend.enabled?
      node_browser_transition('evil')
      return redirect_to root_path, notice: "You're logged into a shared account... be evil"
    end
    if SiteConfig.invite_only?
      return redirect_to login_path, alert: 'The evil account is unavailable while invite-only mode is enabled.'
    end

    evil_user = User.find_by_username('evil')
    if evil_user
      cookies.signed[:surrender_id] = nil
      session[:user_id] = evil_user.id

      redirect_to root_path, notice: "You're logged into a shared account... be evil"
    else
      redirect_to login_path, alert: "Evil user is missing."
    end
  end

  private

  def login_params
    params.permit(:email, :password)
  end
end
