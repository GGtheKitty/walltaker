class ProfilesController < ApplicationController
  rescue_from NodeAccountBackend::Unavailable do
    render plain: 'Profiles are temporarily unavailable. Please try again.', status: :service_unavailable
  end
  rescue_from NodeAccountBackend::Rejected do |error|
    render plain: error.message, status: error.status
  end
  before_action :authorize
  before_action :set_profile_property, only: %i[show show_preview]

  def index
    if NodeBrowserBackend.enabled?
      page = browser_page('profiles', user_id: params[:id], page: params[:page] || 1)
      @user = page.user
      @profiles = page.profiles
      @pagy = Pagy.new(count: page.data.fetch('count'), items: 5, page: page.data.fetch('page'))
      return
    end
    if NodeAccountBackend.enabled?
      @user = User.active.find(params[:id]) if params[:id]
      result = NodeAccountBackend.request('profiles-public', user_id: params[:id], page: params[:page] || 1)
      @pagy = Pagy.new(count: result.fetch('count'), items: 5, page: result.fetch('page'))
      @profiles = result.fetch('profiles').map { |row| Profile.instantiate(row) }
      return
    end
    @user = User.find(params[:id]) if params[:id]
    @pagy, @profiles = pagy(Profile.where(public: true, user_id: params[:id]).includes(:users), items: 5) if params[:id]
    @pagy, @profiles = pagy(Profile.where(public: true).includes(:users), items: 5) unless params[:id]
  end

  def show
  end

  def show_preview
    if NodeBrowserBackend.enabled?
      page = browser_page('profile-preview', profile_id: params[:id])
      @profile = page.profile
      @user = page.graph.find(User, page.data.fetch('preview_user_id'))
      @user.username = "#{Faker::Adjective.positive.titlecase}#{Faker::Creature::Bird.anatomy.titlecase}"
      @user.profile = @profile; @user.advanced = true
      @has_friendship = false; @links = NodeBrowserCollection.new(page.links, Link)
      @any_links_online = @links.is_online.any?; @most_recent_pinged_link = @links.is_online.order(last_ping: :desc).limit(1)
      @past_links = page.past_links; @is_current_user = true
      @total_orgasms = 0; @total_orgasms_caused = 0; @total_orgasms_by_day = {}
      @tracker_status = { @user.id=>{ 'current'=>nil, 'nnn_enabled'=>false } }
      return render 'users/show'
    end
    base_user = User.find_by_username('evil')
    @user = User.build({
                         **base_user.attributes,
                         email: Faker::Internet.email,
                         username: "#{Faker::Adjective.positive.titlecase}#{Faker::Creature::Bird.anatomy.titlecase}",
                         profile: @profile,
                         advanced: true
                       })
    @has_friendship = false
    @links = Link.limit(2)
    @any_links_online = @links.is_online.count.positive?
    @most_recent_pinged_link = @links.order(last_ping: :desc).take(1) if @links.count.positive?
    @past_links = PastLink.take(5)
    @is_current_user = true

    render 'users/show'
  end

  def create
    if NodeAccountBackend.enabled?
      node_profile_command('profile-create')
      return redirect_to edit_user_path(current_user.username)
    end
    profile = current_user.profiles.build({ name: nil, content: '' })
    current_user.profile = profile
    current_user.save

    if profile.save && current_user.save
      redirect_to edit_user_path(current_user.username)
    else
      redirect_to edit_user_path(current_user.username), alert: 'something went wrong'
    end
  end

  def update
    if NodeAccountBackend.enabled?
      if params[:profile_rename_form].present?
        form = params.require(:profile_rename_form).permit(:profile_id, :name)
        node_profile_command('profile-rename', **form.to_h.symbolize_keys)
        return redirect_to edit_user_path(current_user.username)
      elsif params[:profile_adder_form].present?
        node_profile_command('profile-copy', profile_id: params.require(:profile_adder_form).permit(:profile_id)[:profile_id])
        return redirect_to user_path(current_user.username)
      else
        node_profile_command('profile-share', profile_id: params[:id], public: params.require(:profile).permit(:public)[:public])
        current_user.reload
        return render turbo_stream: turbo_stream.update(:sharing_form, partial: 'users/sharing_form', locals: { user: current_user })
      end
    end
    if params['profile_rename_form'].present?
      form = ProfileRenameForm.from_params(params)

      if form && form.profile && current_user.profiles.include?(form.profile)
        if form.profile.update(name: form.name)
          redirect_to edit_user_path(current_user.username)
        else
          redirect_to edit_user_path(current_user.username), alert: 'something went wrong'
        end
      else
        redirect_to edit_user_path(current_user.username), alert: 'something went wrong'
      end
    elsif params['profile_adder_form'].present?
      form = ProfileAdderForm.from_params(params)

      if form && form.profile && form.profile.public
        copy = current_user.profiles.create(name: "#{form.profile.name} #{form.profile.updated_at.to_formatted_s(:short)}", content: form.profile.content, origin: form.profile)

        if copy
          current_user.profile = copy
          if current_user.save
            return redirect_to user_path(current_user.username)
          end
        end
      end

      redirect_to preview_profile_path(form.profile), alert: 'something went wrong'
    else
      profile = Profile.find(params[:id])
      if current_user.profiles.include?(profile)
        if profile.update(params.require(:profile).permit(:public))
          return render turbo_stream: turbo_stream.update(:sharing_form, partial: 'users/sharing_form', locals: { user: current_user })
        end
      end
      redirect_to preview_profile_path(profile), alert: 'something went wrong'
    end
  end

  def destroy
    if NodeAccountBackend.enabled?
      node_profile_command('profile-delete', profile_id: params[:id])
      return redirect_to edit_user_path(current_user.username)
    end
    profile = Profile.find(params[:id])
    current_user.update(profile: nil)

    if profile && profile.destroy
      next_profile = current_user.profiles.order(id: :desc).first
      if next_profile
        current_user.profile = current_user.profiles.order(id: :desc).first
      else
        current_user.profile = nil
      end
      current_user.save
      redirect_to edit_user_path(current_user.username)
    else
      redirect_to edit_user_path(current_user.username), alert: 'something went wrong'
    end
  end

  def set_profile
    if NodeAccountBackend.enabled?
      node_profile_command('profile-select', profile_id: params.require(:profile_selector_form).permit(:profile_id)[:profile_id])
      return redirect_to edit_user_path(current_user.username)
    end
    profile = ProfileSelectorForm.from_params(params).profile
    current_user.profile = profile

    if profile && current_user.save
      redirect_to edit_user_path(current_user.username)
    else
      redirect_to edit_user_path(current_user.username), alert: 'something went wrong'
    end
  end

  private

  def node_profile_command(operation, **input)
    NodeAccountBackend.command(operation, actor: current_user, surrender_id: current_surrender_session&.id,
      request_key: "web:#{request.request_id}:#{operation}", **input)
  end

  def set_profile_property
    if NodeBrowserBackend.enabled?
      @profile = browser_page('profile-style', profile_id: params[:id]).profile
      return
    end
    if NodeAccountBackend.enabled?
      @profile = Profile.instantiate(NodeAccountBackend.request('profile', profile_id: params[:id]).fetch('profile'))
      return
    end
    @profile = Profile.find(params[:id])
    redirect_to root_path, alert: 'Not authorized' unless @profile.public
  end
end
