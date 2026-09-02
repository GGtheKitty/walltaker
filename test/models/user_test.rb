require "test_helper"

class UserTest < ActiveSupport::TestCase
  self.fixture_table_names = []

  test 'no punctuation in usernames' do
    user = User.new
    user.username = '!what ?'
    assert_not user.valid?
  end

  test 'system account username, password, and status are immutable' do
    user = User.create!(
      username: 'SystemModelAccount',
      email: 'system-model@example.com',
      password: 'password',
      password_confirmation: 'password',
      system_account: true
    )

    user.assign_attributes(
      username: 'NotEvil',
      password: 'new-password',
      password_confirmation: 'new-password',
      system_account: false
    )

    assert_not user.save
    assert_includes user.errors[:username], 'cannot be changed for a system account'
    assert_includes user.errors[:password], 'cannot be changed for a system account'
    assert_includes user.errors[:system_account], 'cannot be disabled'
    assert_equal 'SystemModelAccount', user.reload.username
    assert user.system_account?
    assert user.authenticate('password')
  end

  test 'username can only be changed once a week' do
    travel_to Time.zone.local(2026, 8, 15, 12) do
      user = User.create!(
        username: 'FirstUsername',
        email: 'rename-model@example.com',
        password: 'password',
        password_confirmation: 'password'
      )

      assert user.update(username: 'SecondUsername')
      assert_equal Time.current, user.username_changed_at

      user.username = 'ThirdUsername'
      assert_not user.save
      assert_includes user.errors[:username], 'can only be changed once a week'

      travel 1.week
      assert user.update(username: 'ThirdUsername')
      assert_equal Time.current, user.username_changed_at
    end
  end
end
