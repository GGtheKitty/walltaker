class NutPledgesController < ApplicationController
  before_action :require_nut_tracker_enabled
  before_action :authorize, except: [:show, :history]
  before_action :set_user
  before_action :must_be_current_user, except: [:show, :history]

  def show
    @nut_pledge = @user.current_nut_pledge
    @nut_pledges = @user.nut_pledges.latest_first
  end

  def history
    @nut_pledges = @user.nut_pledges.latest_first
  end

  def new
    redirect_to user_path(@user.username) if @user.current_nut_pledge.present?
    @nut_pledge = NutPledge.new
  end

  def create
    return redirect_to user_path(@user.username) if @user.current_nut_pledge.present?
    return redirect_to new_user_nut_pledge_path(@user.username), alert: "Username must be signed exactly!" if params[:nut_pledge][:username] != @user.username

    @nut_pledge = current_user.nut_pledges.build(year: Time.current.year)
    if @nut_pledge.save
      redirect_to user_path(@user.username)
    else
      redirect_to new_user_nut_pledge_path(@user.username), alert: "Something went wrong."
    end
  end

  def update
    @nut_pledge = @user.current_nut_pledge

    if @nut_pledge && !@nut_pledge.failed?
      @nut_pledge.failed_on = Time.now
      @nut_pledge.save
    end

    render :show
  end

  private

  def require_nut_tracker_enabled
    redirect_to root_path, alert: "Nut Tracker is not currently enabled." unless SiteConfig.nut_tracker_enabled?
  end

  def set_user
    @user = User.find_by_username(params[:user_id])
    @is_current_user = current_user && @user.id == current_user.id
  end

  def must_be_current_user
    redirect_to root_path, alert: "Not Authorized" unless @is_current_user
  end
end
