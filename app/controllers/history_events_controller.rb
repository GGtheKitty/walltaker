class HistoryEventsController < ApplicationController
  before_action :authorize

  def index
    if NodeActivityBackend.enabled?
      data = NodeActivityBackend.request('history', actor_id: current_user.id, surrender_id: cookies.signed[:surrender_id])
      history = NodeActivityBackend::History.new(data)
      @events = history.events
      @recognized_wallpaper_clients = history.clients
      @emoji_link_decorations = history.decorations
      response.set_header('X-Walltaker-Activity', 'node')
      response.set_header('Cache-Control', 'no-store')
      return
    end
    @events = HistoryEvent
      .joins(:user)
      .left_joins(:surrender_controller)
      .includes(:ahoy_visit, link: [:user, :abilities])
      .where(user: current_user)
      .order(id: :desc)
      .limit(170)
      .group_by(&:ahoy_visit)
      .sort_by { |visit, list| visit&.started_at || list.last.created_at }
      .reverse!
  end
end
