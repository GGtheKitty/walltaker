class SearchController < ApplicationController
  include NodeDiscoveryActions
  PAGE_SIZE = 5

  def index
  end

  def results
    if NodeDiscoveryBackend.enabled?
      page = discovery('search', query: params[:q].to_s, page: params[:page] || 1, only_online: params[:only_online] == '1')
      data = page.data
      @query = data.fetch('query')
      @only_online = data.fetch('only_online')
      @page = data.fetch('page')
      @total = data.fetch('total')
      @has_next_page = data.fetch('has_next')
      @links = page.links
      return
    end
    @query = params[:q].gsub(/\![\w\d_\(\)]+/, '') || ''
    @only_online = params[:only_online] == '1'
    @page = (params[:page] || '1').to_i

    merged_results = Rails.cache.fetch("v2/searchall/#{params[:q]}/#{@only_online ? 'online' : 'anystate'}", expires_in: 10.minutes) {
      kinks = params[:q].scan(/\![\w\d_\(\)]+/).map { |query| query.gsub('!', '') }

      all_results = Link.search_positive(@query).is_public.is_online if @only_online
      all_results = Link.search_positive(@query).is_public unless @only_online

      all_results_negative = all_results.search_negative(@query).pluck(:id)

      kink_results = Link.is_public.is_online.joins(user: :kinks).where(user: { kinks: { name: kinks } }).or(Link.is_public.is_online.where(theme: kinks)) if @only_online
      kink_results = Link.is_public.joins(user: :kinks).where(user: { kinks: { name: kinks } }).or(Link.is_public.where(theme: kinks)) unless @only_online

      (kink_results.pluck(:id) + all_results.pluck(:id)).uniq.filter {|id| all_results_negative.none? { |neg_id| neg_id == id }}
    }

    result_link_ids = merged_results[((@page - 1) * PAGE_SIZE)..PAGE_SIZE]
    @total = merged_results.length
    @has_next_page = (@total - (@page * PAGE_SIZE)) > 0
    @links = Link.where(id: result_link_ids)
  end
end
