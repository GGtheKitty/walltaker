class HistoryEventsController < ApplicationController
  before_action :authorize

  def index
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
