require "test_helper"

class HelpControllerTest < ActionDispatch::IntegrationTest
  self.fixture_table_names = []

  setup do
    host! "walltaker.joi.how"
  end

  test "should get index" do
    get help_path
    assert_response :success
  end

  test "client guide pins external syntax highlighting assets" do
    get client_guide_path

    assert_response :success
    assert_select "script[src^='https://cdnjs.cloudflare.com/']", count: 5 do |scripts|
      scripts.each do |script|
        assert_match(/\Asha384-[A-Za-z0-9+\/=]+\z/, script['integrity'])
        assert_equal 'anonymous', script['crossorigin']
      end
    end
    assert_pinned_highlight_stylesheet
  end

  test "deprecated client guide pins external syntax highlighting assets" do
    get deprecated_client_guide_path

    assert_response :success
    assert_select "script[src^='https://cdnjs.cloudflare.com/']", count: 2 do |scripts|
      scripts.each do |script|
        assert_match(/\Asha384-[A-Za-z0-9+\/=]+\z/, script['integrity'])
        assert_equal 'anonymous', script['crossorigin']
      end
    end
    assert_pinned_highlight_stylesheet
  end

  private

  def assert_pinned_highlight_stylesheet
    assert_select "link[rel='stylesheet'][href^='https://cdnjs.cloudflare.com/']", count: 1 do |stylesheets|
      stylesheet = stylesheets.first
      assert_match(/\Asha384-[A-Za-z0-9+\/=]+\z/, stylesheet['integrity'])
      assert_equal 'anonymous', stylesheet['crossorigin']
    end
  end
end
