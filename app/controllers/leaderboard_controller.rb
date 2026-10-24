class LeaderboardController < ApplicationController
  include NodeSocialActions
  before_action :serve_node_social
  def index
    @top_setters = User.active.where.not(username: %w[PornLizardKi PornLizardWarren PornLizardTaylor PornBot DeletedAccount28 GiosDominatrix]).order(set_count: :desc).limit(10)
  end
end
