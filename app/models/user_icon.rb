class UserIcon < ApplicationRecord
  attr_accessor :username

  belongs_to :user

  validates :user_id, uniqueness: true
  validates :icon_name, presence: true, format: {
    with: /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/,
    message: 'must be a valid Ionicon name'
  }
end
