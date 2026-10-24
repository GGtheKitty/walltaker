class SettingsController < ApplicationController
  rescue_from NodeAccountBackend::Unavailable do
    render plain: 'Settings are temporarily unavailable. Please try again.', status: :service_unavailable
  end
  before_action :authorize

  def index
    @user = settings_user
  end

  def save
    @user = settings_user
    return save_node_settings if NodeAccountBackend.enabled?

    case params[:settings_action]
    when 'username'
      update_username
    when 'password'
      update_password
    else
      update_colour_preference
    end
  end

  def destroy
    @user = settings_user

    if NodeAccountBackend.enabled?
      begin
        node_settings_command('account-delete', current_password: account_deletion_params[:password])
        cookies.delete :permanent_session_id
        cookies.delete :surrender_id
        reset_session
        return redirect_to login_path, notice: 'Your account has been deleted.'
      rescue NodeAccountBackend::Rejected => error
        return redirect_to settings_path, alert: error.message
      end
    end

    return redirect_to settings_path, alert: 'System accounts cannot be deleted.' if @user.system_account?
    unless @user.authenticate(account_deletion_params[:password].to_s)
      return redirect_to settings_path, alert: 'Current password is incorrect.'
    end

    @user.soft_delete!
    cookies.delete :permanent_session_id
    cookies.delete :surrender_id
    reset_session
    redirect_to login_path, notice: 'Your account has been deleted.'
  rescue ActiveRecord::RecordNotDestroyed
    redirect_to settings_path, alert: 'Your account could not be deleted.'
  end

  private

  def node_settings_command(operation, **input)
    NodeAccountBackend.command(operation, actor: current_user, target_id: @user.id, surrender_id: current_surrender_session&.id,
      request_key: "web:#{request.request_id}:#{operation}", **input)
  end

  def save_node_settings
    operation = %w[username password].include?(params[:settings_action]) ? params[:settings_action] : 'colour'
    node_settings_command(operation, **user_params.to_h.symbolize_keys)
    @user.reload
    current_user.reload if @user.id == current_user.id
    case operation
    when 'password' then redirect_to settings_path, notice: 'Password changed successfully!'
    when 'username' then redirect_to user_path(@user.username), notice: 'Username changed successfully!'
    else redirect_to user_path(@user.username), notice: 'Settings changed successfully!'
    end
  rescue NodeAccountBackend::Rejected => error
    redirect_to settings_path, alert: error.message
  end

  def update_colour_preference
    @user.colour_preference = user_params['colour_preference']

    if @user.save
      if @user == current_user && @user.current_surrender
        Notification.create user: @user, notification_type: :surrender_event, link: user_path(@user), text: "#{@user.current_surrender.controller.username} set your colour scheme to #{@user.colour_preference}"
      end
      redirect_to user_path(@user.username), notice: "Settings changed successfully!"
    else
      redirect_to settings_path, notice: "Unknown error occurred"
    end
  end

  def update_username
    @user.with_lock do
      return redirect_to settings_path, alert: "System account usernames cannot be changed." if @user.system_account?
      unless @user.can_change_username?
        return redirect_to settings_path, alert: 'Username can only be changed once a week.'
      end

      new_username = user_params[:username].to_s.strip

      return redirect_to settings_path, alert: "Username can't be blank." if new_username.blank?

      if username_taken?(new_username)
        return redirect_to settings_path, alert: "#{new_username} is not available."
      end

      @user.username = new_username

      if @user.save
        redirect_to user_path(@user.username), notice: "Username changed successfully!"
      else
        redirect_to settings_path, alert: @user.errors.full_messages.to_sentence
      end
    end
  end

  def update_password
    return redirect_to settings_path, alert: "System account passwords cannot be changed." if @user.system_account?

    unless @user.authenticate(user_params[:current_password].to_s)
      return redirect_to settings_path, alert: "Current password is incorrect."
    end

    return redirect_to settings_path, alert: "New password can't be blank." if user_params[:password].blank?

    @user.password = user_params[:password]
    @user.password_confirmation = user_params[:password_confirmation]

    if @user.save
      redirect_to settings_path, notice: "Password changed successfully!"
    else
      redirect_to settings_path, alert: @user.errors.full_messages.to_sentence
    end
  end

  def user_params
    params.require(:user).permit(:colour_preference, :username, :current_password, :password, :password_confirmation)
  end

  def account_deletion_params
    params.require(:account).permit(:password)
  end

  def settings_user
    return browser_page('settings').user if NodeBrowserBackend.enabled?
    surrender_controller || current_user
  end

  def username_taken?(username)
    User.where("lower(username) = ?", username.downcase).where.not(id: @user.id).exists?
  end
end
