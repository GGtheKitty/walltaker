class SettingsController < ApplicationController
  before_action :authorize

  def index
    @user = settings_user
  end

  def save
    @user = settings_user

    case params[:settings_action]
    when 'username'
      update_username
    when 'password'
      update_password
    else
      update_colour_preference
    end
  end

  private

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

  def update_password
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

  def settings_user
    surrender_controller || current_user
  end

  def username_taken?(username)
    User.where("lower(username) = ?", username.downcase).where.not(id: @user.id).exists?
  end
end
