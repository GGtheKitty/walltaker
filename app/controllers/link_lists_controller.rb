class LinkListsController < ApplicationController
  include NodeSocialActions
  before_action :serve_node_community

  def serve_node_community
    return unless NodeSocialBackend.enabled?
    if action_name == 'index'
      return redirect_to link_lists_path if current_user.nil? && params[:filter] == 'mine'
      result = social('community-interests', query: params[:q], mine: params[:filter] == 'mine', page: params[:page])
      @kinks = social_records(result, 'kinks', Kink)
      @social_previews = result.fetch('previews')
      if NodeBrowserBackend.enabled?
        rows = @social_previews.values.flat_map { |preview| preview.fetch('links') }
        loaded = NodeBrowserBackend.hydrate(Link, rows).index_by(&:id)
        @social_previews.each_value { |preview| preview['links'] = preview.fetch('links').filter_map { |row| loaded[row.fetch('id').to_i] } }
      end
      @pagy = Pagy.new(count: result.fetch('count'), items: 5, page: result.fetch('page'))
    else
      result = social('community-links', kink_id: params[:id], page: params[:page])
      @kink = Kink.instantiate(result.fetch('kink'))
      @links = social_records(result, 'links', Link)
      @pagy = Pagy.new(count: result.fetch('count'), items: 25, page: result.fetch('page'))
    end
    render action_name
  end

  def index
    return redirect_to link_lists_path if current_user.nil? && params[:filter] == 'mine'

    query = Kink.joins(:kink_havers, :links).where(links: Link.is_public).having('count(links) > 0') if params[:filter].nil?
    query = Kink.joins(:kink_havers, :links).where(links: Link.is_public, id: current_user.kinks.pluck(:id)).having('count(links) > 0').group(:id).order('count(kink_havers) desc') if params[:filter] == 'mine'

    query = query.search_name(params[:q]).group(:rank, :id).order('count(kink_havers) desc') if params[:q].present?
    query = query.group(:id).order('count(kink_havers) desc') unless params[:q].present?

    @pagy, @kinks = pagy_arel(query, items: 5)
  end

  def show
    @kink = Kink.find(params[:id])
    @pagy, @links = pagy(@kink.links.is_public.order(updated_at: :desc), items: 25)
  end

  private

  def filter_params
    params.permit(:filter, :q)
  end

  helper_method :filter_params
end
